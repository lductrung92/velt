// Package comments is the CMS comment moderation feature: a queue of comments
// (with article title + PII for the moderating admin) and status decisions
// (approve/spam/reject) plus deletion. PII (email/ip) is admin-only, never logged.
package comments

import (
	"time"

	"github.com/google/uuid"
)

// permModerate gates every moderation endpoint.
const permModerate = "cms.comment.moderate"

// maxPageSize caps the moderation-queue page size.
const maxPageSize = 100

// Comment status values (cms_comments.status CHECK).
const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusSpam     = "spam"
	StatusRejected = "rejected"
)

var validStatus = map[string]bool{
	StatusPending: true, StatusApproved: true,
	StatusSpam: true, StatusRejected: true,
}

// Comment is a cms_comments row.
type Comment struct {
	ID         uuid.UUID
	ArticleID  uuid.UUID
	ParentID   *uuid.UUID
	AuthorName string
	Status     string
	ApprovedAt *time.Time
	CreatedAt  time.Time
}

// row is one moderation-queue row (comment + article title + PII to judge).
type row struct {
	ID           uuid.UUID
	ArticleID    uuid.UUID
	ArticleTitle string
	ParentID     *uuid.UUID
	AuthorName   string
	AuthorEmail  *string
	IPAddress    *string
	Body         string
	Status       string
	ApprovedAt   *time.Time
	CreatedAt    time.Time
}

// ListParams drives the moderation queue.
type ListParams struct {
	Status    string
	ArticleID *uuid.UUID
	Page      int
	PageSize  int
}

// UpdateRequest is the PATCH body (moderation decision).
type UpdateRequest struct {
	Status string `json:"status" validate:"required,oneof=approved spam rejected"`
}

// Item is the admin moderation-queue response (PII included for the admin).
type Item struct {
	ID           uuid.UUID  `json:"id"`
	ArticleID    uuid.UUID  `json:"article_id"`
	ArticleTitle string     `json:"article_title"`
	ParentID     *uuid.UUID `json:"parent_id"`
	AuthorName   string     `json:"author_name"`
	AuthorEmail  *string    `json:"author_email"`
	IPAddress    *string    `json:"ip_address"`
	Body         string     `json:"body"`
	Status       string     `json:"status"`
	ApprovedAt   *time.Time `json:"approved_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

// ListResult is the paginated moderation-queue envelope.
type ListResult struct {
	Items    []Item `json:"items"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}

// toItem converts via struct identity — row and Item MUST keep the same field
// order/types (lockstep). Reordering one without the other silently remaps JSON.
func toItem(r row) Item { return Item(r) }
