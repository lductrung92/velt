// Package newsletter is the CMS newsletter-subscriber admin feature: listing
// (filter by status) and deletion of subscribers. PII (ip_address) is never
// mapped into a response.
package newsletter

import (
	"time"

	"github.com/google/uuid"
)

// permNewsletterManage gates every newsletter endpoint.
const permNewsletterManage = "cms.newsletter.manage"

// maxPageSize caps the subscriber list page size.
const maxPageSize = 100

// Newsletter subscriber list filter values.
const (
	StatusActive       = "active"       // unsubscribed_at IS NULL
	StatusUnsubscribed = "unsubscribed" // unsubscribed_at IS NOT NULL
)

var validStatus = map[string]bool{
	StatusActive: true, StatusUnsubscribed: true,
}

// Subscriber is a cms_newsletter_subscribers row (ip_address is PII, never
// mapped into a response).
type Subscriber struct {
	ID             uuid.UUID
	Email          string
	SourceKey      *string
	ConfirmedAt    *time.Time
	UnsubscribedAt *time.Time
	CreatedAt      time.Time
}

// ListParams drives the admin subscriber list.
type ListParams struct {
	Status   string // "" = all, else active|unsubscribed
	Page     int
	PageSize int
}

// SubscribeRequest is the public newsletter opt-in body.
type SubscribeRequest struct {
	Email  string `json:"email" validate:"required,email,max=320"`
	Source string `json:"source" validate:"omitempty,max=100"`
}

// SubscriberItem is the admin-facing subscriber row (PII stripped).
type SubscriberItem struct {
	ID             uuid.UUID  `json:"id"`
	Email          string     `json:"email"`
	SourceKey      *string    `json:"source_key"`
	ConfirmedAt    *time.Time `json:"confirmed_at"`
	UnsubscribedAt *time.Time `json:"unsubscribed_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ListResult is the paginated subscriber list envelope.
type ListResult struct {
	Items    []SubscriberItem `json:"items"`
	Total    int              `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

// toItem converts via struct identity — Subscriber and SubscriberItem MUST keep
// the same field order/types (lockstep).
func toItem(s Subscriber) SubscriberItem { return SubscriberItem(s) }
