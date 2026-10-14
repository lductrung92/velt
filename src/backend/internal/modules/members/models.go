// Package members is the team-profile bounded context: the public roster VELT
// shows on its site and attaches to products. It is NOT the console login
// identity — see docs/domains/members/README.md §1 for why `users` is a separate
// table. This package imports no other feature module.
package members

import (
	"time"

	"github.com/google/uuid"
)

const (
	permView   = "members.view"   // list/read in the console
	permManage = "members.manage" // create/update/delete/reorder
)

// maxPageSize caps the server-side list page size.
const maxPageSize = 100

// defaultPageSize is used when the client omits page_size.
const defaultPageSize = 20

// --- Domain row (internal) ---

// Link is one external profile link (GitHub, LinkedIn, personal site).
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// Member is a team profile row.
type Member struct {
	ID         uuid.UUID
	Slug       string
	FullName   string
	Role       *string
	Bio        *string
	AvatarPath *string
	Email      *string
	Zalo       *string
	Links      []Link
	Skills     []string
	SortOrder  int
	IsActive   bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// write is the full mutable state persisted on create/update. The service
// resolves a PATCH onto the current row, so the repository only ever does a
// plain full-row UPDATE (same approach as cms/taxonomy).
type write struct {
	Slug     string
	FullName string
	Role     *string
	Bio      *string
	Email    *string
	Zalo     *string
	Links    []Link
	Skills   []string
	// SortOrder nil on create means "append to the end of the roster"; the
	// repository resolves it in SQL. Update always carries a concrete value
	// (the service copies the current row's order unless reordering).
	SortOrder *int
	IsActive  bool
}

// --- Request DTOs ---

// LinkInput is one link in a create/update request.
type LinkInput struct {
	Label string `json:"label" validate:"required,max=60"`
	URL   string `json:"url" validate:"required,url,max=500"`
}

// CreateRequest is the POST /api/members body.
type CreateRequest struct {
	FullName string      `json:"full_name" validate:"required,max=160"`
	Slug     *string     `json:"slug" validate:"omitempty,max=160"`
	Role     *string     `json:"role" validate:"omitempty,max=160"`
	Bio      *string     `json:"bio" validate:"omitempty,max=4000"`
	Email    *string     `json:"email" validate:"omitempty,max=255"`
	Zalo     *string     `json:"zalo" validate:"omitempty,max=500"`
	Links    []LinkInput `json:"links" validate:"omitempty,max=20,dive"`
	Skills   []string    `json:"skills" validate:"omitempty,max=50,dive,max=60"`
	IsActive *bool       `json:"is_active"`
}

// UpdateRequest is the PATCH /api/members/{id} body. Every field is a pointer so
// "absent" (leave as-is) is distinguishable from an explicit new value.
type UpdateRequest struct {
	FullName *string      `json:"full_name" validate:"omitempty,max=160"`
	Slug     *string      `json:"slug" validate:"omitempty,max=160"`
	Role     *string      `json:"role" validate:"omitempty,max=160"`
	Bio      *string      `json:"bio" validate:"omitempty,max=4000"`
	Email    *string      `json:"email" validate:"omitempty,max=255"`
	Zalo     *string      `json:"zalo" validate:"omitempty,max=500"`
	Links    *[]LinkInput `json:"links" validate:"omitempty,max=20,dive"`
	Skills   *[]string    `json:"skills" validate:"omitempty,max=50,dive,max=60"`
	IsActive *bool        `json:"is_active"`
}

// ReorderRequest is the PUT /api/members/order body: the full id list in the
// desired display order.
type ReorderRequest struct {
	IDs []uuid.UUID `json:"ids" validate:"required,min=1,max=500"`
}

// ListParams is the resolved query for the console list.
type ListParams struct {
	Query      string
	ActiveOnly bool
	// CreatedFrom/CreatedTo are the half-open instant bounds resolved by
	// httpx.QueryDateRange — CreatedTo is midnight after the requested day, so
	// the repository compares it with <.
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Page        int
	PageSize    int
	// Locale is the requested language of the public roster; empty, unknown or
	// "vi" all mean the Vietnamese columns as stored. The console list ignores
	// it — an editor works in the source language.
	Locale string
}

// --- Response DTOs ---

// Response is a member as returned by the API. AvatarURL is the served URL
// built from the stored path; the path itself never leaves the server.
type Response struct {
	ID        uuid.UUID `json:"id"`
	Slug      string    `json:"slug"`
	FullName  string    `json:"full_name"`
	Role      *string   `json:"role"`
	Bio       *string   `json:"bio"`
	AvatarURL *string   `json:"avatar_url"`
	Email     *string   `json:"email"`
	Zalo      *string   `json:"zalo"`
	Links     []Link    `json:"links"`
	Skills    []string  `json:"skills"`
	SortOrder int       `json:"sort_order"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListResponse is the paginated console list envelope (same shape as cms).
type ListResponse struct {
	Items    []Response `json:"items"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
}
