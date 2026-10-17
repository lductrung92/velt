package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/ai/endpoints"
	"github.com/velt/backend/internal/modules/ai/provider"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/modules/ai/tools"
)

// historyWindow bounds how much transcript goes back into the next prompt.
const historyWindow = 24

// errTookOver stops a stream mid-answer. It is not a failure: it is the
// assistant obeying the rule that a human owns the conversation now.
var errTookOver = errors.New("conversation no longer belongs to the assistant")

// SettingsPort is the slice of settings the assistant reads.
type SettingsPort interface {
	GetBool(ctx context.Context, key string) bool
	GetInt(ctx context.Context, key string) int
	GetString(ctx context.Context, key string) string
	GetSecret(ctx context.Context, key string) string
}

// NotifyPort rings the browsers of the people on chat duty.
//
// An interface rather than the notify service itself so a conversation can be
// tested without a push stack, and because the whole collaborator is optional:
// a deployment with nobody subscribed leaves it nil and nothing changes.
type NotifyPort interface {
	VisitorWaiting(ctx context.Context, convID uuid.UUID, staffOnline int)
	HasRecipients(ctx context.Context) bool
}

// Service drives a conversation: the guards, the model turn and the fan-out.
type Service struct {
	*shared.Base
	repo      Repository
	hub       *Hub
	presence  *Presence
	reg       *tools.Registry
	catalog   tools.CatalogPort
	settings  SettingsPort
	endpoints *endpoints.Service
	notify    NotifyPort
}

// NewService wires the conversation service.
func NewService(base *shared.Base, repo Repository, hub *Hub, presence *Presence,
	reg *tools.Registry, catalog tools.CatalogPort, settings SettingsPort,
	eps *endpoints.Service, notifier NotifyPort,
) *Service {
	return &Service{Base: base, repo: repo, hub: hub, presence: presence,
		reg: reg, catalog: catalog, settings: settings, endpoints: eps,
		notify: notifier}
}

// canNotify reports whether a notification would reach anybody right now.
// Nil-safe: no push stack wired is the same answer as nobody subscribed.
func (s *Service) canNotify(ctx context.Context) bool {
	return s.notify != nil && s.notify.HasRecipients(ctx)
}

// Hub exposes the fan-out so the handler can subscribe a stream to it.
func (s *Service) Hub() *Hub { return s.hub }

// fanOut publishes an event to the conversation's own watchers and, unless it
// is a streaming fragment, tells the console's queue that this conversation
// moved.
//
// Deltas are deliberately left out: the queue shows a last line and a state,
// neither of which changes token by token, and refetching the whole inbox for
// every fragment of every answer would cost far more than the polling this
// replaces.
func (s *Service) fanOut(convID uuid.UUID, ev Event) {
	s.hub.Publish(convID, ev)
	if ev.Type != EventDelta {
		s.hub.PublishInbox(convID)
	}
}

// --- configuration helpers ---

func (s *Service) maxTurns(ctx context.Context) int {
	if n := s.settings.GetInt(ctx, shared.KeyMaxTurns); n > 0 {
		return n
	}
	return 30
}

func (s *Service) maxMessageLen(ctx context.Context) int {
	if n := s.settings.GetInt(ctx, shared.KeyMaxMessageLen); n > 0 {
		return n
	}
	return 2000
}

// live reports whether the assistant may actually answer right now, and why
// not when it may not.
//
// Three independent reasons to stand down, checked before a single token is
// spent: switched off, not configured, or out of budget for the day. Each one
// degrades to the scripted bot rather than erroring — the visitor should not
// be shown our billing problems.
func (s *Service) live(ctx context.Context) bool {
	if !s.settings.GetBool(ctx, shared.KeyEnabled) {
		return false
	}
	// Asking the adapter, not assuming a key is required: a local endpoint
	// normally has no auth, so "no key" is only disqualifying for a hosted one.
	if !s.client(ctx, shared.PurposeChat).Ready() {
		return false
	}
	// Shared with Status so the screen can never claim something the runtime
	// disagrees with.
	return s.withinBudget(ctx)
}

// client builds the configured endpoint. Rebuilt per turn on purpose: a
// settings change takes effect on the next message rather than on a restart.
// client is the FIRST runnable link of a purpose's chain: what a status
// screen reports and what a connection probe exercises. Answering a turn goes
// through endpoints.Stream instead, which walks the whole chain.
//
// A purpose with nothing runnable yields a client that is not Ready, which is
// the same shape as "not configured" — the callers already handle that.
func (s *Service) client(ctx context.Context, p shared.Purpose) provider.Client {
	links, err := s.endpoints.Available(ctx, string(p))
	if err != nil || len(links) == 0 {
		return provider.New(provider.Config{})
	}
	l := links[0]
	return provider.New(provider.Config{
		Kind: l.Kind, BaseURL: l.BaseURL, APIKey: l.APIKey, Model: l.Model,
	})
}

// --- visitor-facing use cases ---

// Start opens a conversation for a visitor and persists the greeting.
func (s *Service) Start(ctx context.Context, visitorKey string, req StartRequest) (StartResponse, error) {
	visitorKey = strings.TrimSpace(visitorKey)
	if visitorKey == "" {
		return StartResponse{}, apperr.BadRequest("bad_request")
	}

	var referrerID *uuid.UUID
	var referrerName string
	if ref := strings.TrimSpace(req.Ref); ref != "" {
		// A dead referral link is the sharer's problem, not the visitor's:
		// drop it silently and carry on without an introducer.
		if id, name, err := s.repo.MemberBySlug(ctx, ref); err == nil {
			referrerID, referrerName = id, name
		}
	}

	conv, err := s.repo.Create(ctx, visitorKey, referrerID)
	if err != nil {
		return StartResponse{}, s.MapRepoErr(ctx, "start conversation", err)
	}

	hello := greeting(referrerName, req.Locale)
	if _, err := s.repo.AddMessage(ctx, Message{
		ConversationID: conv.ID, Role: RoleAssistant, Content: hello,
	}); err != nil {
		return StartResponse{}, s.MapRepoErr(ctx, "start conversation: greeting", err)
	}

	// A brand-new conversation has no watchers yet, so there is nobody to
	// publish an event to — but the console's queue needs to learn it exists.
	s.hub.PublishInbox(conv.ID)

	res := StartResponse{
		ID: conv.ID, State: conv.State, Degraded: !s.live(ctx), Greeting: hello,
	}
	if referrerID != nil {
		res.Referrer = &ReferrerRef{Slug: strings.TrimSpace(req.Ref), FullName: referrerName}
	}
	return res, nil
}

// Current returns the conversation this visitor is already in, if any.
//
// This is what makes a reload keep the thread. The lookup is by the visitor
// cookie the server itself set, so the browser never has to hold a
// conversation id: there is nothing for a script on the page to read, and
// nothing a visitor can edit to claim somebody else's thread. Ownership is
// decided by the same cookie every other endpoint here already checks.
//
// Returns ErrNotFound when the visitor has no open thread. That is the normal
// case for a first visit, not an error worth logging loudly.
func (s *Service) Current(ctx context.Context, visitorKey string) (StartResponse, error) {
	visitorKey = strings.TrimSpace(visitorKey)
	if visitorKey == "" {
		return StartResponse{}, apperr.NotFound("not_found")
	}
	conv, err := s.repo.ActiveByVisitor(ctx, visitorKey)
	if err != nil {
		return StartResponse{}, s.MapRepoErr(ctx, "current conversation", err)
	}
	return StartResponse{ID: conv.ID, State: conv.State, Degraded: !s.live(ctx)}, nil
}

// Send accepts one visitor message and answers it.
//
// The HTTP reply is only an acknowledgement; the answer goes out over the SSE
// stream. That split is what lets a slow model turn run without holding the
// request open.
func (s *Service) Send(ctx context.Context, visitorKey string, convID uuid.UUID, req SendRequest) (SendResponse, error) {
	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		return SendResponse{}, s.MapRepoErr(ctx, "send: load", err)
	}
	if conv.VisitorKey != visitorKey {
		return SendResponse{}, s.MapRepoErr(ctx, "send", shared.ErrNotOwner)
	}
	if conv.State == StateClosed {
		return SendResponse{}, s.MapRepoErr(ctx, "send", shared.ErrClosed)
	}

	text := strings.TrimSpace(req.Content)
	if text == "" {
		return SendResponse{}, apperr.Validation(map[string]string{"content": "required"})
	}
	if max := s.maxMessageLen(ctx); len(text) > max {
		text = text[:max]
	}

	// One statement, so two quick messages cannot both slip under the ceiling.
	turns, err := s.repo.BumpTurn(ctx, convID)
	if err != nil {
		return SendResponse{}, s.MapRepoErr(ctx, "send: bump", err)
	}
	if turns > s.maxTurns(ctx) {
		return SendResponse{}, s.MapRepoErr(ctx, "send", shared.ErrTurnLimit)
	}

	saved, err := s.repo.AddMessage(ctx, Message{
		ConversationID: convID, Role: RoleVisitor, Content: text,
	})
	if err != nil {
		return SendResponse{}, s.MapRepoErr(ctx, "send: persist", err)
	}
	s.fanOut(convID, Event{Type: EventMessage, Message: toView(*saved)})

	degraded := !s.live(ctx)

	// A conversation a human owns gets no assistant reply at all. The visitor's
	// message is still recorded and fanned out — that is how the person who
	// took over sees it.
	if conv.State != StateBot {
		// Nobody is coming unless somebody is told. The service decides
		// whether to actually send: it stays quiet while an operator is at
		// the desk, and rings at most once per conversation per window.
		if s.notify != nil {
			s.notify.VisitorWaiting(ctx, convID, s.presence.Count())
		}
		return SendResponse{Accepted: true, Degraded: degraded}, nil
	}

	if degraded {
		reply := scriptedReply(text, req.Locale)
		s.persistAssistant(ctx, convID, reply, provider.Usage{})
		return SendResponse{Accepted: true, Degraded: true}, nil
	}

	// Detached from the request: the browser gets its 202 now and reads the
	// answer off the stream. A cancelled HTTP request must not kill a turn the
	// visitor is still watching.
	// The locale travels with the turn rather than living on the conversation
	// row: a visitor who switches the site to English mid-thread expects the
	// next answer in English, not the language they happened to open with.
	go s.answer(context.WithoutCancel(ctx), convID, req.Locale)

	return SendResponse{Accepted: true, Degraded: false}, nil
}

// answer runs one assistant turn and streams it to whoever is watching.
func (s *Service) answer(ctx context.Context, convID uuid.UUID, locale string) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		s.Sec(ctx).Error("ai: load conversation", "err", err)
		return
	}
	// Which conversation this is, and who gets credited for a lead from it,
	// travel in the context — never in the model's tool arguments. They are
	// facts about the session, not something the visitor's text can steer.
	ctx = tools.WithLeadContext(ctx, tools.LeadContext{
		ConversationID:   convID,
		ReferrerMemberID: conv.ReferrerMemberID,
	})

	history, err := s.repo.History(ctx, convID, historyWindow)
	if err != nil {
		s.Sec(ctx).Error("ai: history", "err", err)
		s.fanOut(convID, Event{Type: EventError, Code: "internal"})
		return
	}

	msgs := make([]provider.Message, 0, len(history))
	for _, m := range history {
		switch m.Role {
		case RoleVisitor:
			msgs = append(msgs, provider.Message{Role: provider.RoleUser, Content: m.Content})
		case RoleAssistant, RoleStaff:
			// Staff lines are shown to the model as assistant turns: from the
			// visitor's side the conversation is one voice, and the model needs
			// to know what has already been said on its behalf.
			msgs = append(msgs, provider.Message{Role: provider.RoleAssistant, Content: m.Content})
		}
	}
	if len(msgs) == 0 {
		return
	}

	allow := tools.VisitorAllowlist
	specs := make([]provider.ToolSpec, 0, len(allow))
	for _, t := range s.reg.Visible(allow) {
		specs = append(specs, provider.ToolSpec{
			Name: t.Name, Description: t.Description, InputSchema: t.Schema,
		})
	}

	// The whole chain, not one endpoint: a link that answers 429 before it has
	// written anything hands over to the next one. See endpoints.Stream.
	text, usage, err := endpoints.Stream(ctx, s.endpoints, provider.New, s.Sec(ctx),
		string(shared.PurposeChat), provider.StreamRequest{
			System:   buildSystem(ctx, s.catalog, s.settings.GetString(ctx, shared.KeySystemPersona), locale),
			Messages: msgs,
			Tools:    specs,
			OnDelta:  s.deltaGuard(ctx, convID),
			Invoke: func(ctx context.Context, name string, input json.RawMessage) (any, error) {
				// Checked against the allowlist again here, not just when the specs
				// were built: a model can name a tool it was never offered.
				return s.reg.Call(ctx, allow, name, input)
			},
		})

	if usage.InputTokens > 0 || usage.OutputTokens > 0 {
		if err := s.repo.AddUsage(ctx, usage.InputTokens, usage.OutputTokens); err != nil {
			s.Sec(ctx).Error("ai: usage write", "err", err)
		}
	}

	if errors.Is(err, errTookOver) {
		// Persist what was already said so the transcript is honest about it,
		// then go quiet.
		if strings.TrimSpace(text) != "" {
			s.persistAssistant(ctx, convID, text, usage)
		}
		return
	}
	if err != nil {
		s.Sec(ctx).Error("ai: stream", "conversation_id", convID, "err", err)
		// Fall back rather than leaving the visitor staring at nothing.
		s.persistAssistant(ctx, convID, scriptedReply("", locale), provider.Usage{})
		return
	}
	if strings.TrimSpace(text) == "" {
		return
	}
	s.persistAssistant(ctx, convID, text, usage)
}

// deltaGuard returns the function that gates every streamed fragment.
//
// THE invariant of this module. The state is re-read on EVERY fragment, not
// once before the turn: an answer takes seconds, and a member can take the
// conversation over halfway through. Checking only up front is exactly how a
// bot ends up talking over a human.
// See docs/diagrams/ai-conversation-state.svg
func (s *Service) deltaGuard(ctx context.Context, convID uuid.UUID) func(string) error {
	return func(frag string) error {
		cur, err := s.repo.Get(ctx, convID)
		if err != nil || !cur.Speaking() {
			return errTookOver
		}
		s.hub.Publish(convID, Event{Type: EventDelta, Text: frag})
		return nil
	}
}

// persistAssistant stores an assistant line and fans it out as a finished
// message, which is what the client replaces its streamed fragments with.
func (s *Service) persistAssistant(ctx context.Context, convID uuid.UUID, text string, u provider.Usage) {
	saved, err := s.repo.AddMessage(ctx, Message{
		ConversationID: convID, Role: RoleAssistant, Content: text,
		TokenIn: u.InputTokens, TokenOut: u.OutputTokens,
	})
	if err != nil {
		s.Sec(ctx).Error("ai: persist assistant", "err", err)
		return
	}
	s.fanOut(convID, Event{Type: EventMessage, Message: toView(*saved)})
}

// Transcript returns the conversation so far, for a visitor reopening the
// widget. Ownership is checked; a stranger gets a 404, not a 403.
func (s *Service) Transcript(ctx context.Context, visitorKey string, convID uuid.UUID) ([]MessageView, error) {
	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "transcript: load", err)
	}
	if conv.VisitorKey != visitorKey {
		return nil, s.MapRepoErr(ctx, "transcript", shared.ErrNotOwner)
	}
	rows, err := s.repo.History(ctx, convID, historyWindow)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "transcript", err)
	}
	out := make([]MessageView, 0, len(rows))
	for _, m := range rows {
		// System lines ARE for the visitor — "a member has joined", "we are
		// connecting you". Hiding them here would make them vanish on reload
		// after the visitor had already read them live.
		out = append(out, *toView(m))
	}
	return out, nil
}

// Owns reports whether this visitor key owns the conversation. The SSE handler
// needs the check before it attaches a listener.
func (s *Service) Owns(ctx context.Context, visitorKey string, convID uuid.UUID) error {
	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		return s.MapRepoErr(ctx, "owns: load", err)
	}
	if conv.VisitorKey != visitorKey {
		return s.MapRepoErr(ctx, "owns", shared.ErrNotOwner)
	}
	return nil
}

func toView(m Message) *MessageView {
	return &MessageView{ID: m.ID, Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt}
}
