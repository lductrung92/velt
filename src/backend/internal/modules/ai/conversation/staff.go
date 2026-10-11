package conversation

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/shared"
)

// The console-facing half of a conversation: the inbox, taking one over, and
// answering as a person. Everything here needs ai.chat.handle — reading a
// transcript is reading a customer conversation.

// InboxItem is one row of the console inbox.
type InboxItem struct {
	ID             uuid.UUID  `json:"id"`
	State          string     `json:"state"`
	ClaimedBy      *uuid.UUID `json:"claimed_by_user_id"`
	LeadID         *uuid.UUID `json:"lead_id"`
	LastMessage    *string    `json:"last_message"`
	LastRole       *string    `json:"last_role"`
	MessageCount   int        `json:"message_count"`
	LastActivityAt time.Time  `json:"last_activity_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

// StaffMessageRequest is one reply typed by a person.
type StaffMessageRequest struct {
	Content string `json:"content" validate:"required"`
}

// Inbox lists live conversations. `waiting` first is the caller's job: the
// console asks for that state when it wants the queue.
func (s *Service) Inbox(ctx context.Context, id *httpx.Identity, state string, limit int) ([]InboxItem, error) {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	switch state {
	case "", StateBot, StateWaiting, StateHuman, StateClosed:
	default:
		state = ""
	}
	rows, err := s.repo.Inbox(ctx, state, limit)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "inbox", err)
	}
	out := make([]InboxItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, InboxItem{
			ID: r.ID, State: r.State, ClaimedBy: r.ClaimedByUserID, LeadID: r.LeadID,
			LastMessage: r.LastMessage, LastRole: r.LastRole,
			MessageCount:   r.MessageCount,
			LastActivityAt: r.LastActivityAt, CreatedAt: r.CreatedAt,
		})
	}
	return out, nil
}

// StaffTranscript returns a full transcript, system notes included — unlike the
// visitor's view, a person working the conversation should see everything.
func (s *Service) StaffTranscript(ctx context.Context, id *httpx.Identity, convID uuid.UUID) ([]MessageView, error) {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return nil, err
	}
	rows, err := s.repo.History(ctx, convID, 200)
	if err != nil {
		return nil, s.MapRepoErr(ctx, "staff transcript", err)
	}
	out := make([]MessageView, 0, len(rows))
	for _, m := range rows {
		out = append(out, *toView(m))
	}
	return out, nil
}

// Claim takes a conversation over. The assistant goes quiet from here.
func (s *Service) Claim(ctx context.Context, id *httpx.Identity, convID uuid.UUID) error {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return err
	}
	won, err := s.repo.Claim(ctx, convID, id.UserID)
	if err != nil {
		return s.MapRepoErr(ctx, "claim", err)
	}
	if !won {
		// Someone else got there first. Telling them is the point: two people
		// answering one customer without knowing is worse than a conflict.
		return s.MapRepoErr(ctx, "claim", shared.ErrAlreadyClaimed)
	}
	s.announce(ctx, convID, StateHuman,
		"Một thành viên của Zukatek đã tham gia cuộc trò chuyện.")
	return nil
}

// Release hands the conversation back to the assistant.
func (s *Service) Release(ctx context.Context, id *httpx.Identity, convID uuid.UUID) error {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return err
	}
	if err := s.repo.Release(ctx, convID); err != nil {
		return s.MapRepoErr(ctx, "release", err)
	}
	s.announce(ctx, convID, StateBot, "")
	return nil
}

// StaffReply posts a message as a real person.
//
// It does NOT require the sender to be the one who claimed it: in a small team,
// a colleague stepping in for someone at lunch is normal, and blocking that
// would be a rule nobody asked for. The author is recorded either way.
func (s *Service) StaffReply(ctx context.Context, id *httpx.Identity, convID uuid.UUID, req StaffMessageRequest) (MessageView, error) {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return MessageView{}, err
	}
	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		return MessageView{}, s.MapRepoErr(ctx, "staff reply: load", err)
	}
	if conv.State == StateClosed {
		return MessageView{}, s.MapRepoErr(ctx, "staff reply", shared.ErrClosed)
	}

	author := id.UserID
	saved, err := s.repo.AddMessage(ctx, Message{
		ConversationID: convID, Role: RoleStaff, AuthorUserID: &author,
		Content: req.Content,
	})
	if err != nil {
		return MessageView{}, s.MapRepoErr(ctx, "staff reply", err)
	}
	s.hub.Publish(convID, Event{Type: EventMessage, Message: toView(*saved)})
	return *toView(*saved), nil
}

// Close ends a conversation.
func (s *Service) Close(ctx context.Context, id *httpx.Identity, convID uuid.UUID) error {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return err
	}
	if err := s.repo.SetState(ctx, convID, StateClosed); err != nil {
		return s.MapRepoErr(ctx, "close", err)
	}
	s.announce(ctx, convID, StateClosed, "")
	return nil
}

// Beat records that a member is on duty, and reports how many are.
func (s *Service) Beat(ctx context.Context, id *httpx.Identity) (int, error) {
	if err := s.Require(ctx, id, permHandle); err != nil {
		return 0, err
	}
	s.presence.Beat(id.UserID)
	return s.presence.Count(), nil
}

// --- visitor side of the handoff ---

// RequestHuman moves a conversation to `waiting`.
//
// When nobody is on duty it says so instead of parking the visitor in a queue
// that will not move — and leaves the conversation with the assistant, which
// can still take their contact details.
func (s *Service) RequestHuman(ctx context.Context, visitorKey string, convID uuid.UUID) (string, error) {
	conv, err := s.repo.Get(ctx, convID)
	if err != nil {
		return "", s.MapRepoErr(ctx, "handoff: load", err)
	}
	if conv.VisitorKey != visitorKey {
		return "", s.MapRepoErr(ctx, "handoff", shared.ErrNotOwner)
	}
	if conv.State == StateClosed {
		return "", s.MapRepoErr(ctx, "handoff", shared.ErrClosed)
	}
	if conv.State == StateHuman {
		return StateHuman, nil // already with a person
	}

	if !s.presence.AnyOnline() {
		return "", s.MapRepoErr(ctx, "handoff", shared.ErrNoStaff)
	}
	if err := s.repo.SetState(ctx, convID, StateWaiting); err != nil {
		return "", s.MapRepoErr(ctx, "handoff", err)
	}
	s.announce(ctx, convID, StateWaiting,
		"Đang chuyển bạn cho người phụ trách, chờ một chút nhé.")
	return StateWaiting, nil
}

// announce publishes a state change and, optionally, a system line explaining
// it. The state event is what tells a client to stop waiting for the assistant.
func (s *Service) announce(ctx context.Context, convID uuid.UUID, state, note string) {
	s.hub.Publish(convID, Event{Type: EventState, State: state})
	if note == "" {
		return
	}
	saved, err := s.repo.AddMessage(ctx, Message{
		ConversationID: convID, Role: RoleSystem, Content: note,
	})
	if err != nil {
		s.Sec(ctx).Error("ai: announce", "err", err)
		return
	}
	s.hub.Publish(convID, Event{Type: EventMessage, Message: toView(*saved)})
}
