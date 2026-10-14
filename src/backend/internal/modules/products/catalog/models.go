// Package catalog is the product-catalog feature: the products VELT builds and
// sells. Reads are gated by products.view, authoring by products.create/edit,
// and the publish transitions by products.publish. It references no other
// products feature's types.
package catalog

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	permView    = "products.view"
	permCreate  = "products.create"
	permEdit    = "products.edit"
	permDelete  = "products.delete"
	permPublish = "products.publish"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

// Publication status — who can see the row at all.
const (
	StatusDraft     = "draft"
	StatusPublished = "published"
	StatusArchived  = "archived"
)

// Lifecycle — what the page says about the product. Independent of status: a
// team can publish an `idea` to gauge demand (docs/domains/products §3).
const (
	LifecycleIdea     = "idea"
	LifecycleBuilding = "building"
	LifecycleLaunched = "launched"
)

var validLifecycle = map[string]bool{
	LifecycleIdea: true, LifecycleBuilding: true, LifecycleLaunched: true,
}

// --- Domain row (internal) ---

// SEO is the per-product meta block, mirroring cms_articles.
type SEO struct {
	Title       *string `json:"title" validate:"omitempty,max=255"`
	Description *string `json:"description" validate:"omitempty,max=500"`
	Keywords    *string `json:"keywords" validate:"omitempty,max=255"`
	Canonical   *string `json:"canonical_url" validate:"omitempty,max=500"`
	NoIndex     bool    `json:"noindex"`
	NoFollow    bool    `json:"nofollow"`
	OGTitle     *string `json:"og_title" validate:"omitempty,max=255"`
	OGDesc      *string `json:"og_description" validate:"omitempty,max=500"`
	OGPath      *string `json:"og_path" validate:"omitempty,max=500"`
}

// Product is a catalog row.
type Product struct {
	ID        uuid.UUID
	Slug      string
	Name      string
	Summary   *string
	BodyHTML  *string
	BodyJSON  json.RawMessage
	CoverPath *string

	Status    string
	Lifecycle string

	Version    *string
	ReleasedAt *time.Time

	Audience   []string
	Platforms  []string
	TechStack  []string
	Highlights []string

	IsFeatured bool
	SortOrder  int

	ProductURL       *string
	DemoURL          *string
	DemoAccess       *string
	DemoInstructions []string

	SEO SEO

	PublishedAt       *time.Time
	PublishedSnapshot json.RawMessage

	CreatedBy *uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

// write is the full mutable state persisted on create/update. The service
// resolves a PATCH onto the current row, so the repository only ever does a
// plain full-row UPDATE. Status transitions go through their own repo methods —
// they are not part of an ordinary edit.
type write struct {
	Slug      string
	Name      string
	Summary   *string
	BodyHTML  *string
	BodyJSON  json.RawMessage
	CoverPath *string

	Lifecycle  string
	Version    *string
	ReleasedAt *time.Time

	Audience   []string
	Platforms  []string
	TechStack  []string
	Highlights []string

	IsFeatured bool
	// SortOrder nil on create means "append to the end"; the repository resolves
	// it in SQL. Update always carries a concrete value.
	SortOrder *int

	ProductURL       *string
	DemoURL          *string
	DemoAccess       *string
	DemoInstructions []string

	SEO SEO
}

// --- Request DTOs ---

// CreateRequest is the POST /api/products body. Only name is required; a
// product starts as a draft idea and is filled in over time.
type CreateRequest struct {
	Name             string          `json:"name" validate:"required,max=200"`
	Slug             *string         `json:"slug" validate:"omitempty,max=200"`
	Summary          *string         `json:"summary" validate:"omitempty,max=500"`
	BodyHTML         *string         `json:"body_html"`
	BodyJSON         json.RawMessage `json:"body_json"`
	CoverPath        *string         `json:"cover_path" validate:"omitempty,max=500"`
	Lifecycle        *string         `json:"lifecycle" validate:"omitempty,max=20"`
	Version          *string         `json:"version" validate:"omitempty,max=40"`
	ReleasedAt       *string         `json:"released_at"` // "" clears it; format checked in the service
	Audience         []string        `json:"audience" validate:"omitempty,max=20,dive,max=60"`
	Platforms        []string        `json:"platforms" validate:"omitempty,max=20,dive,max=60"`
	TechStack        []string        `json:"tech_stack" validate:"omitempty,max=50,dive,max=60"`
	Highlights       []string        `json:"highlights" validate:"omitempty,max=20,dive,max=300"`
	IsFeatured       *bool           `json:"is_featured"`
	SortOrder        *int            `json:"sort_order" validate:"omitempty,min=0,max=100000"`
	ProductURL       *string         `json:"product_url" validate:"omitempty,max=500"`
	DemoURL          *string         `json:"demo_url" validate:"omitempty,max=500"`
	DemoAccess       *string         `json:"demo_access" validate:"omitempty,max=300"`
	DemoInstructions []string        `json:"demo_instructions" validate:"omitempty,max=20,dive,max=300"`
	SEO              *SEO            `json:"seo"`
}

// UpdateRequest is the PATCH body. Every field is a pointer (or a slice checked
// for nil) so "absent" — leave as-is — is distinguishable from a new value; an
// empty string clears an optional field.
//
// status is deliberately absent: it changes only through /publish, /unpublish
// and /archive, so the publish permission stays separable from the edit one.
type UpdateRequest struct {
	Name             *string         `json:"name" validate:"omitempty,max=200"`
	Slug             *string         `json:"slug" validate:"omitempty,max=200"`
	Summary          *string         `json:"summary" validate:"omitempty,max=500"`
	BodyHTML         *string         `json:"body_html"`
	BodyJSON         json.RawMessage `json:"body_json"`
	CoverPath        *string         `json:"cover_path" validate:"omitempty,max=500"`
	Lifecycle        *string         `json:"lifecycle" validate:"omitempty,max=20"`
	Version          *string         `json:"version" validate:"omitempty,max=40"`
	ReleasedAt       *string         `json:"released_at"` // "" clears it; format checked in the service
	Audience         *[]string       `json:"audience" validate:"omitempty,max=20,dive,max=60"`
	Platforms        *[]string       `json:"platforms" validate:"omitempty,max=20,dive,max=60"`
	TechStack        *[]string       `json:"tech_stack" validate:"omitempty,max=50,dive,max=60"`
	Highlights       *[]string       `json:"highlights" validate:"omitempty,max=20,dive,max=300"`
	IsFeatured       *bool           `json:"is_featured"`
	SortOrder        *int            `json:"sort_order" validate:"omitempty,min=0,max=100000"`
	ProductURL       *string         `json:"product_url" validate:"omitempty,max=500"`
	DemoURL          *string         `json:"demo_url" validate:"omitempty,max=500"`
	DemoAccess       *string         `json:"demo_access" validate:"omitempty,max=300"`
	DemoInstructions *[]string       `json:"demo_instructions" validate:"omitempty,max=20,dive,max=300"`
	SEO              *SEO            `json:"seo"`
}

// ListParams is the resolved console-list query. CreatedFrom/CreatedTo are the
// half-open instant bounds resolved by httpx.QueryDateRange — CreatedTo is
// midnight after the requested day, so the repository compares it with <.
type ListParams struct {
	Query       string
	Status      string
	Lifecycle   string
	Platform    string
	Audience    string
	Featured    *bool
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Sort        string
	Page        int
	PageSize    int
}

// --- Response DTOs ---

// ListItem is the row shape of the console list — enough to render the table
// without shipping every product's body.
type ListItem struct {
	ID         uuid.UUID  `json:"id"`
	Slug       string     `json:"slug"`
	Name       string     `json:"name"`
	Summary    *string    `json:"summary"`
	CoverURL   *string    `json:"cover_url"`
	Status     string     `json:"status"`
	Lifecycle  string     `json:"lifecycle"`
	Version    *string    `json:"version"`
	ReleasedAt *string    `json:"released_at"`
	IsFeatured bool       `json:"is_featured"`
	SortOrder  int        `json:"sort_order"`
	UpdatedAt  time.Time  `json:"updated_at"`
	PublishedA *time.Time `json:"published_at"`
}

// ListResponse is the paginated envelope (same shape as cms).
type ListResponse struct {
	Items    []ListItem `json:"items"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
}

// Response is the full product as returned by the API.
type Response struct {
	ID        uuid.UUID       `json:"id"`
	Slug      string          `json:"slug"`
	Name      string          `json:"name"`
	Summary   *string         `json:"summary"`
	BodyHTML  *string         `json:"body_html"`
	BodyJSON  json.RawMessage `json:"body_json"`
	CoverURL  *string         `json:"cover_url"`
	CoverPath *string         `json:"cover_path"`

	Status    string `json:"status"`
	Lifecycle string `json:"lifecycle"`

	Version    *string `json:"version"`
	ReleasedAt *string `json:"released_at"`

	Audience   []string `json:"audience"`
	Platforms  []string `json:"platforms"`
	TechStack  []string `json:"tech_stack"`
	Highlights []string `json:"highlights"`

	IsFeatured bool `json:"is_featured"`
	SortOrder  int  `json:"sort_order"`

	ProductURL       *string  `json:"product_url"`
	DemoURL          *string  `json:"demo_url"`
	DemoAccess       *string  `json:"demo_access"`
	DemoInstructions []string `json:"demo_instructions"`

	SEO SEO `json:"seo"`

	// Relations, always present (possibly empty) so the client never has to
	// distinguish "no categories" from "not loaded".
	Categories []CategoryRef `json:"categories"`
	Members    []MemberRef   `json:"members"`
	Gallery    []MediaItem   `json:"gallery"`

	PublishedAt *time.Time `json:"published_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// UploadResponse is the reply to a media upload: the stored path (which the
// client echoes back in cover_path / og_path) plus the URL to render now.
type UploadResponse struct {
	Path string `json:"path"`
	URL  string `json:"url"`
}
