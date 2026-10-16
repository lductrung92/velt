// Package pages is the CMS static-page feature: a hierarchical tree of admin-only
// pages with a 4-state lifecycle (draft/scheduled/published/archived, no review)
// and a published snapshot. Slug-bearing (unique per parent). It references no
// other CMS feature's types.
package pages

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
)

const (
	permView    = "cms.page.view"
	permCreate  = "cms.page.create"
	permEdit    = "cms.page.edit"
	permDelete  = "cms.page.delete"
	permPublish = "cms.page.publish" // publish / unpublish
)

// Page status values (cms_pages.status CHECK).
const (
	PageStatusDraft     = "draft"
	PageStatusScheduled = "scheduled"
	PageStatusPublished = "published"
	PageStatusArchived  = "archived"
)

// Page is a full page row (working copy + publish metadata).
type Page struct {
	ID                uuid.UUID
	Title             string
	Slug              string
	BodyHTML          *string
	BodyJSON          json.RawMessage
	ParentID          *uuid.UUID
	SortOrder         int
	Template          *string
	Status            string
	OGPath            *string
	SEOTitle          *string
	SEODescription    *string
	SEOKeywords       *string
	CanonicalURL      *string
	SEONoindex        bool
	SEONofollow       bool
	OGTitle           *string
	OGDescription     *string
	LandingID         *uuid.UUID
	PublishedAt       *time.Time
	PublishedSnapshot json.RawMessage
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// PageListParams narrows the page tree. CreatedFrom/CreatedTo are the
// half-open instant bounds resolved by httpx.QueryDateRange — CreatedTo is
// midnight after the requested day, so the repository compares it with <.
//
// Filtering happens on the flat rows, before the tree is assembled: a page
// inside the range whose parent falls outside it surfaces as a root rather
// than disappearing, so the node count always equals the number of matching
// rows. That is what keeps the dashboard's page count and the page list it
// sits above telling the same story.
type PageListParams struct {
	Query       string
	Status      string
	LandingOnly bool
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Page        int
	PageSize    int
	// Locale is the language the console is reading in (Accept-Language), "" for
	// the source language. The list overlays the stored translation of the title
	// it shows; the page's own row is untouched.
	Locale string
}

// maxPageListSize caps the server-side page list, like every other admin list.
const maxPageListSize = 100

// PageListItem is one row of the pages list.
//
// Flat, and without parent_id: a page's address is a single slug segment (see
// public_sync.go), the site routes none of them through a parent, and nothing
// in the console could ever set one. The column stays in the table — no data is
// thrown away — but it stopped being part of what this module answers.
type PageListItem struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Template    *string    `json:"template"`
	Status      string     `json:"status"`
	LandingID   *uuid.UUID `json:"landing_id"` // set → the page is a landing design
	PublishedAt *time.Time `json:"published_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// PageListResult is the paginated list envelope.
type PageListResult struct {
	Items    []PageListItem `json:"items"`
	Total    int            `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
}

// PageOption is a page as a picker needs it: the whole set, unpaginated, with
// nothing a selector does not read. Same shape and reason as TagOption.
type PageOption struct {
	ID     uuid.UUID `json:"id"`
	Title  string    `json:"title"`
	Slug   string    `json:"slug"`
	Status string    `json:"status"`
}

func toPageListItem(p Page) PageListItem {
	return PageListItem{
		ID: p.ID, Title: p.Title, Slug: p.Slug, Template: p.Template,
		Status: p.Status, LandingID: p.LandingID, PublishedAt: p.PublishedAt,
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

// pageWrite is the full mutable working state persisted on create/update (PATCH
// merged onto the current row → plain full-row UPDATE). Status / published_at /
// snapshot change ONLY via publish/unpublish, never here.
type pageWrite struct {
	Title          string
	Slug           string
	BodyHTML       *string
	BodyJSON       json.RawMessage
	ParentID       *uuid.UUID
	SortOrder      int
	Template       *string
	OGPath         *string
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
	CanonicalURL   *string
	SEONoindex     bool
	SEONofollow    bool
	OGTitle        *string
	OGDescription  *string
	LandingID      *uuid.UUID
}

// PageKindLanding marks a page created as a landing design: the backend creates
// an empty draft landing and attaches it (landing_id); the landing then follows
// the page's lifecycle (publish/unpublish/delete cascade). The default ("" or
// "content") creates a plain rich-text page.
const PageKindLanding = "landing"

// CreatePageRequest creates a page. Slug derives from title when omitted.
type CreatePageRequest struct {
	Title     string          `json:"title" validate:"required,max=200"`
	Slug      *string         `json:"slug" validate:"omitempty,max=200"`
	SortOrder *int            `json:"sort_order" validate:"omitempty,min=0"`
	Template  *string         `json:"template" validate:"omitempty,max=100"`
	BodyHTML  *string         `json:"body_html"`
	BodyJSON  json.RawMessage `json:"body_json"`
	OGPath    *string         `json:"og_path" validate:"omitempty,max=500"`
	LandingID *uuid.UUID      `json:"landing_id"`
	Kind      string          `json:"kind" validate:"omitempty,oneof=content landing"`
	SEO       *shared.PageSEO `json:"seo"`
}

// UpdatePageRequest patches a page. parent_id uses Optional (clear → move to root
// vs leave unchanged). updated_at is the optimistic-lock token. seo is a
// whole-object replace.
type UpdatePageRequest struct {
	Title          *string                    `json:"title" validate:"omitempty,max=200"`
	Slug           *string                    `json:"slug" validate:"omitempty,max=200"`
	SortOrder      *int                       `json:"sort_order" validate:"omitempty,min=0"`
	Template       *string                    `json:"template" validate:"omitempty,max=100"`
	BodyHTML       *string                    `json:"body_html"`
	BodyJSON       json.RawMessage            `json:"body_json"`
	OGPath         *string                    `json:"og_path" validate:"omitempty,max=500"`
	LandingID      shared.Optional[uuid.UUID] `json:"landing_id"`
	SEO            *shared.PageSEO            `json:"seo"`
	UpdatedAt      *time.Time                 `json:"updated_at" validate:"required"`
	RegenerateSlug bool                       `json:"regenerate_slug"`
}

// PageDetailResponse is the full page (GET /{id}, create/update return).
type PageDetailResponse struct {
	ID                uuid.UUID       `json:"id"`
	Title             string          `json:"title"`
	Slug              string          `json:"slug"`
	BodyHTML          *string         `json:"body_html"`
	BodyJSON          json.RawMessage `json:"body_json"`
	SortOrder         int             `json:"sort_order"`
	Template          *string         `json:"template"`
	Status            string          `json:"status"`
	OGPath            *string         `json:"og_path"`
	LandingID         *uuid.UUID      `json:"landing_id"`
	SEO               shared.PageSEO  `json:"seo"`
	PublishedAt       *time.Time      `json:"published_at"`
	PublishedSnapshot json.RawMessage `json:"published_snapshot"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// pageSnapshot is the public-facing subset frozen into published_snapshot.
type pageSnapshot struct {
	Title         string             `json:"title"`
	Slug          string             `json:"slug"`
	BodyHTML      *string            `json:"body_html"`
	Template      *string            `json:"template"`
	OGPath        *string            `json:"og_path"`
	LandingID     *uuid.UUID         `json:"landing_id"`
	SEO           shared.PageSEO     `json:"seo"`
	InlineWidgets []inlineWidgetSnap `json:"inline_widgets"`
}

// inlineWidgetSnap freezes one inline widget (a `widget` node embedded in the
// page body) into the snapshot: its body-placeholder id (wid), type and
// sanitized config. Data is resolved fresh at read time, like blockSnap.
type inlineWidgetSnap struct {
	Wid    string          `json:"wid"`
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config"`
}

func pageSEO(p Page) shared.PageSEO {
	return shared.PageSEO{
		Title: p.SEOTitle, Description: p.SEODescription, Keywords: p.SEOKeywords,
		CanonicalURL: p.CanonicalURL, NoIndex: p.SEONoindex, NoFollow: p.SEONofollow,
		OGTitle: p.OGTitle, OGDescription: p.OGDescription,
	}
}

func toPageDetail(p Page) PageDetailResponse {
	return PageDetailResponse{
		ID: p.ID, Title: p.Title, Slug: p.Slug, BodyHTML: p.BodyHTML, BodyJSON: p.BodyJSON,
		SortOrder: p.SortOrder, Template: p.Template, Status: p.Status,
		OGPath: p.OGPath, LandingID: p.LandingID, SEO: pageSEO(p), PublishedAt: p.PublishedAt,
		PublishedSnapshot: p.PublishedSnapshot, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}
