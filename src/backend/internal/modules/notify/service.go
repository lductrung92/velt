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

// Who hears what. A kind goes to the people who can act on it, which is not
// one list: whoever answers chats is not necessarily whoever chases leads,
// and a mailing list is a third job again. Sending everything to everyone is
// how a team learns to ignore the sound.
const (
	permHandle     = "ai.chat.handle"
	permLeads      = "crm.leads.view_all"
	permNewsletter = "cms.newsletter.manage"
)

// Service registers browsers and pushes to them.
type Service struct {
	repo    *Repository
	aead    *crypto.AEAD
	log     *slog.Logger
	subject string
	// settings answers whether a kind is switched on. Optional: nil means
	// every kind is delivered, which is what this module did before the
	// switches existed.
	settings SettingsPort
}

// SetSettings supplies the per-kind switches.
func (s *Service) SetSettings(p SettingsPort) { s.settings = p }

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
	if !s.enabled(ctx, KeyVisitorWaiting) {
		return
	}
	// Debounced per conversation: a visitor typing several lines is one event
	// to the person at the other end.
	ok, err := s.repo.ClaimNotify(ctx, convID, notifyWindow)
	if err != nil {
		s.log.Error("notify: claim", "err", err)
		return
	}
	if !ok {
		return // already rang for this conversation recently
	}
	s.push(ctx, permHandle, payload{
		Kind: KindVisitorWaiting, ConversationID: convID.String(),
	})
}

// ChatMessage notifies that a visitor has started talking.
//
// Only the FIRST message of a conversation reaches here — the caller decides
// that, because only it knows the turn count. A notification per message
// would be one per line typed, which is how somebody ends up muting the
// console. Later messages in a thread that nobody picks up are covered by
// VisitorWaiting instead.
func (s *Service) ChatMessage(ctx context.Context, convID uuid.UUID) {
	if !s.enabled(ctx, KeyChatMessage) {
		return
	}
	ok, err := s.repo.ClaimNotify(ctx, convID, notifyWindow)
	if err != nil {
		s.log.Error("notify: claim", "err", err)
		return
	}
	if !ok {
		return
	}
	s.push(ctx, permHandle, payload{
		Kind: KindChatMessage, ConversationID: convID.String(),
	})
}

// LeadCreated notifies that somebody filled in the contact form.
//
// Not debounced: a form submission is one discrete act, not a stream, and the
// public endpoint is already rate-limited per IP. It goes to whoever can read
// leads, which is a different set of people from the chat roster.
func (s *Service) LeadCreated(ctx context.Context, leadID uuid.UUID) {
	if !s.enabled(ctx, KeyLeadNew) {
		return
	}
	s.push(ctx, permLeads, payload{Kind: KindLeadNew, EntityID: leadID.String()})
}

// NewsletterSubscribed notifies that somebody signed up for the newsletter.
// No id: the notification opens the subscriber list, not a row, and the
// public opt-in deliberately does not report which record it touched.
func (s *Service) NewsletterSubscribed(ctx context.Context) {
	if !s.enabled(ctx, KeyNewsletterNew) {
		return
	}
	s.push(ctx, permNewsletter, payload{Kind: KindNewsletterNew})
}

// push is the shared path: find the keys, find the people, hand off.
//
// The decision to notify is made on the caller's goroutine and the delivery
// is not: a visitor's request must not wait on a push service, but whether a
// notification happens at all is something the caller can see and a test can
// assert. Keeping the `go` in here rather than at every call site is also
// what stops two callers disagreeing about it.
//
// Everything here is best-effort. Nothing a visitor does may fail because a
// push service was unreachable, so problems are logged and swallowed.
func (s *Service) push(ctx context.Context, perm string, p payload) {
	pub, priv, err := s.keys(ctx, false)
	if err != nil {
		s.log.Error("notify: keys", "err", err)
		return
	}
	if pub == "" {
		return // nobody has turned notifications on yet
	}
	subs, err := s.repo.Recipients(ctx, perm)
	if err != nil {
		s.log.Error("notify: recipients", "err", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	body, err := json.Marshal(p)
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

// SendTest pushes to the caller's OWN browsers and reports what each one
// did. Synchronous, unlike every other push here: the point of the button is
// the answer, so the request waits for it.
//
// What it can and cannot tell you. "ok" means a push service accepted the
// message for that browser — Google, Mozilla, Apple. Whether a notification
// then appears depends on the service worker installed in that browser and on
// the operating system's own settings, neither of which reports back. So an
// "ok" with nothing on screen is a real and useful answer: it rules out this
// server, the keys, the subscription and the network, and leaves the machine.
func (s *Service) SendTest(ctx context.Context, userID uuid.UUID) (TestResponse, error) {
	pub, priv, err := s.keys(ctx, true)
	if err != nil {
		return TestResponse{}, err
	}
	subs, err := s.repo.Own(ctx, userID)
	if err != nil {
		return TestResponse{}, err
	}
	body, err := json.Marshal(payload{Kind: KindTest})
	if err != nil {
		return TestResponse{}, err
	}

	out := TestResponse{Devices: make([]TestResult, 0, len(subs))}
	var delivered, dead []uuid.UUID
	for _, sub := range subs {
		status := "failed"
		switch s.send(ctx, sub, body, pub, priv) {
		case resultOK:
			status, out.Accepted = "ok", out.Accepted+1
			delivered = append(delivered, sub.ID)
		case resultGone:
			status = "gone"
			dead = append(dead, sub.ID)
		}
		out.Devices = append(out.Devices, TestResult{ID: sub.ID, Label: sub.Label, Status: status})
	}
	s.repo.MarkUsed(ctx, delivered)
	s.repo.Prune(ctx, dead)
	return out, nil
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
