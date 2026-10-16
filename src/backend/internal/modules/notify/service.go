package notify

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/crypto"
)

// notifyWindow is how long one conversation stays quiet after a notification.
// A visitor typing several lines is one event to a person at the other end,
// not five.
const notifyWindow = 5 * time.Minute

// pushTimeout bounds one delivery. The push services are usually fast; a slow
// one must not hold up the visitor's own reply, which is already on its way.
const pushTimeout = 10 * time.Second

// permHandle is the permission that makes somebody a recipient: the same one
// that lets them answer a chat.
const permHandle = "ai.chat.handle"

// Service registers browsers and pushes to them.
type Service struct {
	repo    *Repository
	aead    *crypto.AEAD
	log     *slog.Logger
	subject string
}

// NewService wires the service. subject is the "mailto:" or URL a push service
// can use to reach the sender; VAPID requires one.
func NewService(repo *Repository, aead *crypto.AEAD, log *slog.Logger, subject string) *Service {
	if strings.TrimSpace(subject) == "" {
		subject = "mailto:admin@localhost"
	}
	return &Service{repo: repo, aead: aead, log: log, subject: subject}
}

// --- keys ---

// PublicKey returns the VAPID public key, creating the pair on first use.
//
// Generated rather than configured: the pair is this server's own identity to
// the push services, not a credential from anybody. Asking an operator to run
// a key-generation command before notifications work would be a step that
// exists only because nobody wrote this function.
func (s *Service) PublicKey(ctx context.Context) (string, error) {
	pub, _, err := s.keys(ctx, true)
	return pub, err
}

// keys returns the decrypted VAPID pair. create says whether a missing pair
// should be generated: the console asking for the public key is a reason to
// mint one, a visitor's message is not — nobody has subscribed yet, so there
// would be nothing to send to.
func (s *Service) keys(ctx context.Context, create bool) (string, string, error) {
	pub, sealed, err := s.repo.Keys(ctx)
	if err != nil {
		return "", "", err
	}
	if pub == "" {
		if !create {
			return "", "", nil
		}
		priv, newPub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return "", "", err
		}
		sealedNew, err := s.aead.Encrypt([]byte(priv))
		if err != nil {
			return "", "", err
		}
		if pub, sealed, err = s.repo.EnsureKeys(ctx, newPub, sealedNew); err != nil {
			return "", "", err
		}
		if pub == newPub {
			s.log.Info("notify: generated a VAPID key pair")
		}
	}
	plain, err := s.aead.Decrypt(sealed)
	if err != nil {
		return "", "", err
	}
	return pub, string(plain), nil
}

// --- registration ---

// Subscribe registers the caller's browser.
func (s *Service) Subscribe(ctx context.Context, userID uuid.UUID, in SubscribeRequest) error {
	in.Endpoint = strings.TrimSpace(in.Endpoint)
	in.Label = strings.TrimSpace(in.Label)
	return s.repo.Upsert(ctx, userID, in)
}

// Subscriptions lists the caller's registered browsers.
func (s *Service) Subscriptions(ctx context.Context, userID uuid.UUID) ([]Subscription, error) {
	return s.repo.List(ctx, userID)
}

// Unsubscribe removes one of the caller's browsers.
func (s *Service) Unsubscribe(ctx context.Context, userID, id uuid.UUID) error {
	return s.repo.Delete(ctx, userID, id)
}

// --- sending ---

// VisitorWaiting notifies the duty roster that somebody needs a person.
//
// staffOnline is what the presence map currently says. Nobody is notified
// while an operator is at the desk: the console is already showing them the
// queue, and a notification for something you are looking at is noise.
//
// The decision is made on the caller's goroutine and the delivery is not: a
// visitor's message must not wait on a push service, but whether a
// notification happens at all is something the caller can see and a test can
// assert. Keeping the `go` in here rather than at every call site is also
// what stops two callers disagreeing about it.
//
// Everything here is best-effort. A conversation must never fail because a
// push service was unreachable, so problems are logged and swallowed.
func (s *Service) VisitorWaiting(ctx context.Context, convID uuid.UUID, staffOnline int) {
	if staffOnline > 0 {
		return
	}
	pub, priv, err := s.keys(ctx, false)
	if err != nil {
		s.log.Error("notify: keys", "err", err)
		return
	}
	if pub == "" {
		return // nobody has turned notifications on yet
	}
	ok, err := s.repo.ClaimNotify(ctx, convID, notifyWindow)
	if err != nil {
		s.log.Error("notify: claim", "err", err)
		return
	}
	if !ok {
		return // already rang for this conversation recently
	}
	subs, err := s.repo.Recipients(ctx, permHandle)
	if err != nil {
		s.log.Error("notify: recipients", "err", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	body, err := json.Marshal(payload{Kind: KindVisitorWaiting, ConversationID: convID.String()})
	if err != nil {
		return
	}

	go s.deliver(context.WithoutCancel(ctx), subs, body, pub, priv)
}

// deliver pushes to every registered browser and tidies up after.
func (s *Service) deliver(ctx context.Context, subs []subscription, body []byte, pub, priv string) {
	var delivered, dead []uuid.UUID
	for _, sub := range subs {
		switch s.send(ctx, sub, body, pub, priv) {
		case resultOK:
			delivered = append(delivered, sub.ID)
		case resultGone:
			dead = append(dead, sub.ID)
		}
	}
	s.repo.MarkUsed(ctx, delivered)
	// A browser that uninstalled or cleared its data answers 404/410 forever.
	// Dropping it here is what keeps the table from filling with endpoints
	// that can only ever fail.
	s.repo.Prune(ctx, dead)
	if len(dead) > 0 {
		s.log.Info("notify: dropped expired push subscriptions", "count", len(dead))
	}
}

type sendResult int

const (
	resultOK sendResult = iota
	resultGone
	resultFailed
)

func (s *Service) send(ctx context.Context, sub subscription, body []byte, pub, priv string) sendResult {
	ctx, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()

	res, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  pub,
		VAPIDPrivateKey: priv,
		TTL:             int(notifyWindow.Seconds()),
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		s.log.Warn("notify: push failed", "err", err)
		return resultFailed
	}
	defer func() { _ = res.Body.Close() }()

	switch res.StatusCode {
	case http.StatusNotFound, http.StatusGone:
		return resultGone
	case http.StatusOK, http.StatusCreated, http.StatusAccepted, http.StatusNoContent:
		return resultOK
	default:
		// A 429 or a 5xx is this push service having a moment, not a dead
		// browser: keep the subscription and let the next message try again.
		s.log.Warn("notify: push rejected", "status", res.StatusCode)
		return resultFailed
	}
}

// HasRecipients reports whether a notification would reach anybody.
func (s *Service) HasRecipients(ctx context.Context) bool {
	ok, err := s.repo.HasRecipients(ctx, permHandle)
	if err != nil {
		s.log.Error("notify: has recipients", "err", err)
		return false
	}
	return ok
}
