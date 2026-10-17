package conversation

import (
	"time"

	"github.com/google/uuid"
)

// Permission for the console-facing surface (inbox, takeover). The
// visitor-facing surface has no permission at all — there is no identity.
const permHandle = "ai.chat.handle"

// Conversation states. The whole module rests on this: the state decides who
// may speak. See docs/diagrams/ai-conversation-state.svg.
const (
	StateBot     = "bot"     // the assistant answers
	StateWaiting = "waiting" // a human was asked for, nobody has taken it yet
	StateHuman   = "human"   // a member took over; the assistant is silent
	StateClosed  = "closed"
)

// Message roles. `staff` is distinct from `assistant` so a transcript read back
// later can still say who actually answered.
const (
	RoleVisitor   = "visitor"
	RoleAssistant = "assistant"
	RoleStaff     = "staff"
	RoleSystem    = "system"
)

// --- Domain rows (internal) ---

// Conversation is one chat with one anonymous visitor.
type Conversation struct {
	ID               uuid.UUID
	State            string
	VisitorKey       string
	ReferrerMemberID *uuid.UUID
	LeadID           *uuid.UUID
	ClaimedByUserID  *uuid.UUID
	ClaimedAt        *time.Time
	TurnCount        int
	LastActivityAt   time.Time
	CreatedAt        time.Time
}

// Speaking reports whether the assistant is allowed to produce text right now.
// Anything other than StateBot means a person owns the conversation.
func (c Conversation) Speaking() bool { return c.State == StateBot }

// Message is one line of the transcript.
type Message struct {
	ID             uuid.UUID
	ConversationID uuid.UUID
	Role           string
	AuthorUserID   *uuid.UUID
	Content        string
	TokenIn        int
	TokenOut       int
	CreatedAt      time.Time
}

// --- Request DTOs ---

// StartRequest opens a conversation.
type StartRequest struct {
	// Ref is the slug of the member whose link brought the visitor here. A
	// wrong or missing value is ignored rather than refused: a broken referral
	// link is not the visitor's fault.
	Ref string `json:"ref" validate:"omitempty,max=160"`
	// Page is where the visitor is standing, so the greeting can be relevant.
	Page string `json:"page" validate:"omitempty,max=300"`
	// Locale is the language the visitor is reading the site in. Anything
	// other than "en" is treated as Vietnamese, so a stale or junk value
	// degrades to the default rather than failing the request.
	Locale string `json:"locale" validate:"omitempty,max=10"`
}

// SendRequest posts one visitor message.
type SendRequest struct {
	Content string `json:"content" validate:"required"`
	// Locale travels per message, not per conversation: switching the site to
	// English mid-thread should change the next answer.
	Locale string `json:"locale" validate:"omitempty,max=10"`
}

// --- Response DTOs ---

// StartResponse is the reply to opening a conversation.
type StartResponse struct {
	ID    uuid.UUID `json:"id"`
	State string    `json:"state"`
	// Degraded says the assistant is not answering right now (disabled, no key,
	// or over budget) and the site should fall back to its scripted bot.
	Degraded bool `json:"degraded"`
	// Greeting is the opening line, already persisted as the first message.
	Greeting string `json:"greeting"`
	// Referrer is the member who introduced the visitor, when there was one.
	Referrer *ReferrerRef `json:"referrer"`
}

// ReferrerRef identifies the introducing member to the site.
//
// FullName carries the member's PUBLIC name — display_name, or their real one
// when they have not set an alias (MemberBySlug resolves it). The field keeps
// its old name so the wire shape does not change; the value has never been a
// legal name since migration 0051.
type ReferrerRef struct {
	Slug     string `json:"slug"`
	FullName string `json:"full_name"`
}

// MessageView is one transcript line on the wire.
type MessageView struct {
	ID        uuid.UUID `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// SendResponse acknowledges a visitor message. The answer itself arrives on the
// SSE stream, not here.
type SendResponse struct {
	Accepted bool `json:"accepted"`
	Degraded bool `json:"degraded"`
}
