// Package categories is the product-taxonomy feature: a FLAT, slug-bearing list
// of product categories. Reads are gated by products.view; writes by
// products.category.manage. It references no other products feature's types.
package categories

import (
	"time"

	"github.com/google/uuid"
)

const (
	permView   = "products.view"            // list/read
	permManage = "products.category.manage" // create/update/delete/reorder
)

// Category status values (product_categories.status CHECK).
//
// Three, not the editorial workflow's six: a category is never submitted for
// review and never scheduled, so those states would be unreachable. Same
// vocabulary as the CMS taxonomy's, so both admin screens stay interchangeable.
const (
	StatusDraft     = "draft"
	StatusPublished = "published"
	StatusArchived  = "archived"
)

// validStatus is the set accepted by the list `status` filter.
var validStatus = map[string]bool{
	StatusDraft: true, StatusPublished: true, StatusArchived: true,
}

// --- Domain row (internal) ---

// Category is a product-category row.
type Category struct {
	ID             uuid.UUID
	Slug           string
	Name           string
	Description    *string
	SortOrder      int
	Status         string
	ProductCount   int
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// write is the full mutable state persisted on create/update. The service
// resolves a PATCH onto the current row, so the repository only ever does a
// plain full-row UPDATE.
type write struct {
	Slug           string
	Name           string
	Description    *string
	Status         string
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
	// SortOrder nil on create means "append to the end"; the repository resolves
	// it in SQL. Update always carries a concrete value.
	SortOrder *int
}

// --- Request DTOs ---

// CategorySEO is the per-category SEO sub-object (public category page meta).
// Same shape and limits as the CMS taxonomy's, so the two admin screens stay
// interchangeable.
type CategorySEO struct {
	Title       *string `json:"title" validate:"omitempty,max=255"`
	Description *string `json:"description" validate:"omitempty,max=500"`
	Keywords    *string `json:"keywords" validate:"omitempty,max=255"`
}

// CreateRequest is the POST /api/product-categories body.
type CreateRequest struct {
	Name        string  `json:"name" validate:"required,max=160"`
	Slug        *string `json:"slug" validate:"omitempty,max=160"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	SortOrder   *int    `json:"sort_order" validate:"omitempty,min=0,max=100000"`
	// Status defaults to published: a category that exists is in use, and the
	// rows already in the table mean exactly that.
	Status *string      `json:"status" validate:"omitempty,oneof=draft published archived"`
	SEO    *CategorySEO `json:"seo"`
}

// UpdateRequest is the PATCH body. Every field is a pointer so "absent" (leave
// as-is) is distinguishable from an explicit new value; an empty string clears
// an optional field.
type UpdateRequest struct {
	Name        *string      `json:"name" validate:"omitempty,max=160"`
	Slug        *string      `json:"slug" validate:"omitempty,max=160"`
	Description *string      `json:"description" validate:"omitempty,max=1000"`
	SortOrder   *int         `json:"sort_order" validate:"omitempty,min=0,max=100000"`
	Status      *string      `json:"status" validate:"omitempty,oneof=draft published archived"`
	SEO         *CategorySEO `json:"seo"`
}

// ReorderRequest is the PUT /api/product-categories/order body: the full id list
// in the desired display order.
type ReorderRequest struct {
	IDs []uuid.UUID `json:"ids" validate:"required,min=1,max=500"`
}

// --- Response DTOs ---

// Response is a category as returned by the API. ProductCount is how many
// products currently sit in it — the console shows it before asking to confirm
// a delete, since deleting unlinks those products rather than removing them.
type Response struct {
	ID   uuid.UUID `json:"id"`
	Slug string    `json:"slug"`
	Name string    `json:"name"`
	// NameDisplay is Name in the language the request asked for, falling back
	// to Name itself. It is for SHOWING a category — a list, a picker — and
	// nothing else: this list is also what hydrates the category editor, so
	// Name has to keep carrying the stored Vietnamese or the next save would
	// write the translation over it. Same contract as the CMS taxonomy's.
	NameDisplay  string      `json:"name_display"`
	Description  *string     `json:"description"`
	SortOrder    int         `json:"sort_order"`
	Status       string      `json:"status"`
	ProductCount int         `json:"product_count"`
	SEO          CategorySEO `json:"seo"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

// ListResponse is the flat list envelope. The taxonomy is small and curated, so
// it is never paginated — the whole vocabulary is the useful unit.
type ListResponse struct {
	Items []Response `json:"items"`
}
