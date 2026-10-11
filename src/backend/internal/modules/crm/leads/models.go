package leads

import (
	"time"

	"github.com/google/uuid"
)

// Permissions. `view` and `view_all` are split from day one: in a small team
// everyone sees everything anyway, but once the team is not small, one seller
// browsing another's customers is a decision someone should make on purpose.
const (
	permView    = "crm.leads.view"
	permViewAll = "crm.leads.view_all"
	permManage  = "crm.leads.manage"
)

// Sources a lead can arrive from.
const (
	SourceChat   = "chat"
	SourceForm   = "form"
	SourceManual = "manual"
)

// Statuses, deliberately few — every extra one is another chance for the user
// to guess wrong.
const (
	StatusNew       = "new"
	StatusContacted = "contacted"
	StatusQualified = "qualified"
	StatusWon       = "won"
	StatusLost      = "lost"
)

var validSources = map[string]bool{SourceChat: true, SourceForm: true, SourceManual: true}

var validStatuses = map[string]bool{
	StatusNew: true, StatusContacted: true, StatusQualified: true,
	StatusWon: true, StatusLost: true,
}

// --- Domain row (internal) ---

// Lead is a person who showed interest and left a way to be reached.
type Lead struct {
	ID    uuid.UUID
	Name  *string
	Email *string
	Phone *string
	Zalo  *string

	Source         string
	ConversationID *uuid.UUID

	AssignedMemberID *uuid.UUID
	Status           string
	Note             *string

	CreatedAt time.Time
	UpdatedAt time.Time
}

// write is the full mutable state persisted on create/update. The service
// resolves a PATCH onto the current row, so the repository only ever does a
// plain full-row UPDATE — same shape as the products module.
type write struct {
	Name             *string
	Email            *string
	Phone            *string
	Zalo             *string
	Source           string
	ConversationID   *uuid.UUID
	AssignedMemberID *uuid.UUID
	Status           string
	Note             *string
}

// --- Request DTOs ---

// Contact is the reachability block. At least one channel must survive
// trimming; the DB enforces the same rule as a last line of defence.
type Contact struct {
	Name  *string `json:"name" validate:"omitempty,max=160"`
	Email *string `json:"email" validate:"omitempty,max=255"`
	Phone *string `json:"phone" validate:"omitempty,max=40"`
	Zalo  *string `json:"zalo" validate:"omitempty,max=255"`
}

// CreateRequest is the POST /api/crm/leads body.
//
// Note the absence of format validators on the pointer fields: go-playground
// checks the POINTER, not the value, so `omitempty,email` still fires for a
// non-nil pointer to "" — the console's "clear this field" sentinel. Format is
// checked in the service after trimming instead. See .wolf/cerebrum.md.
type CreateRequest struct {
	Contact
	Source           *string     `json:"source" validate:"omitempty,max=20"`
	ConversationID   *uuid.UUID  `json:"conversation_id"`
	AssignedMemberID *uuid.UUID  `json:"assigned_member_id"`
	Status           *string     `json:"status" validate:"omitempty,max=20"`
	Note             *string     `json:"note" validate:"omitempty,max=2000"`
	ProductIDs       []uuid.UUID `json:"product_ids" validate:"omitempty,max=20"`
}

// UpdateRequest is the PATCH body. Every field is a pointer so "absent" (leave
// as-is) is distinguishable from a new value; an empty string clears an
// optional field.
type UpdateRequest struct {
	Contact
	AssignedMemberID *uuid.UUID  `json:"assigned_member_id"`
	Status           *string     `json:"status" validate:"omitempty,max=20"`
	Note             *string     `json:"note" validate:"omitempty,max=2000"`
	ProductIDs       []uuid.UUID `json:"product_ids" validate:"omitempty,max=20"`
	// ClearAssignee returns the lead to the shared queue. A null
	// assigned_member_id cannot express this on its own: in a PATCH, absent and
	// null are the same JSON.
	ClearAssignee bool `json:"clear_assignee"`
}

// ListParams is the resolved console-list query.
type ListParams struct {
	Query    string
	Status   string
	Source   string
	Assignee string // member uuid, or "unassigned", or "" for no filter
	Page     int
	PageSize int
}

// --- Response DTOs ---

// ProductRef is a product a lead asked about.
type ProductRef struct {
	ID   uuid.UUID `json:"id"`
	Slug string    `json:"slug"`
	Name string    `json:"name"`
}

// MemberRef is the member a lead is assigned to.
type MemberRef struct {
	ID       uuid.UUID `json:"id"`
	Slug     string    `json:"slug"`
	FullName string    `json:"full_name"`
}

// Response is a lead as returned by the API.
type Response struct {
	ID    uuid.UUID `json:"id"`
	Name  *string   `json:"name"`
	Email *string   `json:"email"`
	Phone *string   `json:"phone"`
	Zalo  *string   `json:"zalo"`

	Source         string     `json:"source"`
	ConversationID *uuid.UUID `json:"conversation_id"`

	Assignee *MemberRef `json:"assignee"`
	Status   string     `json:"status"`
	Note     *string    `json:"note"`

	// Always present (possibly empty) so the client never has to tell "no
	// products" from "not loaded".
	Products []ProductRef `json:"products"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListResponse is the paginated envelope.
type ListResponse struct {
	Items    []Response `json:"items"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
}
