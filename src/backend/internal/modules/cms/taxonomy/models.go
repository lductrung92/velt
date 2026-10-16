// Package taxonomy is the CMS taxonomy feature: categories (a tree) and tags
// (flat), both slug-bearing. Reads are gated by cms.article.view; writes by
// cms.taxonomy.manage. It references no other CMS feature's types.
package taxonomy

import (
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/localize"
)

const (
	permView   = "cms.article.view"    // read categories/tags
	permManage = "cms.taxonomy.manage" // create/update/delete/merge
)

// maxTagPageSize caps the server-side tag list page size.
const maxTagPageSize = 100

// Category status values (cms_categories.status CHECK).
//
// Three, not the article workflow's six: a category is never submitted for
// review and never scheduled, so those states would be unreachable.
const (
	CategoryStatusDraft     = "draft"
	CategoryStatusPublished = "published"
	CategoryStatusArchived  = "archived"
)

// validCategoryStatus is the set accepted by the list `status` filter.
var validCategoryStatus = map[string]bool{
	CategoryStatusDraft: true, CategoryStatusPublished: true, CategoryStatusArchived: true,
}

// --- Domain rows (internal) ---

// Category is a taxonomy category row.
type Category struct {
	ID             uuid.UUID
	Name           string
	Slug           string
	ParentID       *uuid.UUID
	Description    *string
	SortOrder      int
	Status         string
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// categoryWithCount is a category row plus its direct article count.
type categoryWithCount struct {
	Category
	ArticleCount int
}

// categoryWrite is the full mutable state persisted on create/update (service
// resolves a PATCH onto the current row → plain full-row UPDATE).
type categoryWrite struct {
	Name           string
	Slug           string
	ParentID       *uuid.UUID
	Description    *string
	SortOrder      int
	Status         string
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
}

// Tag is a flat taxonomy tag row.
type Tag struct {
	ID        uuid.UUID
	Name      string
	Slug      string
	CreatedAt time.Time
}

// tagWithCount is a tag row plus its article usage count.
type tagWithCount struct {
	Tag
	UsageCount int
}

// --- Request DTOs ---

// CategorySEO is the per-category SEO sub-object (web category page meta).
type CategorySEO struct {
	Title       *string `json:"title" validate:"omitempty,max=255"`
	Description *string `json:"description" validate:"omitempty,max=500"`
	Keywords    *string `json:"keywords" validate:"omitempty,max=255"`
}

// CreateCategoryRequest creates a category. Slug is derived from name when omitted.
type CreateCategoryRequest struct {
	Name        string     `json:"name" validate:"required,max=160"`
	Slug        *string    `json:"slug" validate:"omitempty,max=160"`
	ParentID    *uuid.UUID `json:"parent_id"`
	Description *string    `json:"description" validate:"omitempty,max=2000"`
	SortOrder   *int       `json:"sort_order" validate:"omitempty,min=0"`
	// Status defaults to published: a category that exists is in use, and the
	// rows already in the table mean exactly that.
	Status *string      `json:"status" validate:"omitempty,oneof=draft published archived"`
	SEO    *CategorySEO `json:"seo"`
}

// UpdateCategoryRequest patches a category. parent_id uses Optional so it can be
// explicitly cleared (move to root) vs left unchanged.
type UpdateCategoryRequest struct {
	Name           *string                    `json:"name" validate:"omitempty,max=160"`
	Slug           *string                    `json:"slug" validate:"omitempty,max=160"`
	ParentID       shared.Optional[uuid.UUID] `json:"parent_id"`
	Description    *string                    `json:"description" validate:"omitempty,max=2000"`
	SortOrder      *int                       `json:"sort_order" validate:"omitempty,min=0"`
	Status         *string                    `json:"status" validate:"omitempty,oneof=draft published archived"`
	SEO            *CategorySEO               `json:"seo"`
	RegenerateSlug bool                       `json:"regenerate_slug"`
	UpdatedAt      *time.Time                 `json:"updated_at" validate:"required"`
}

// CreateTagRequest creates a tag. Slug is derived from name when omitted.
type CreateTagRequest struct {
	Name string  `json:"name" validate:"required,max=80"`
	Slug *string `json:"slug" validate:"omitempty,max=80"`
}

// UpdateTagRequest patches a tag (name and/or slug).
type UpdateTagRequest struct {
	Name           *string `json:"name" validate:"omitempty,max=80"`
	Slug           *string `json:"slug" validate:"omitempty,max=80"`
	RegenerateSlug bool    `json:"regenerate_slug"`
}

// MergeTagsRequest merges source into target (moves associations, deletes source).
type MergeTagsRequest struct {
	SourceID uuid.UUID `json:"source_id" validate:"required"`
	TargetID uuid.UUID `json:"target_id" validate:"required"`
}

// TagListParams are the query params for the paginated tag list. Query filters
// name/slug (case-insensitive substring); Page is 1-based.
type TagListParams struct {
	Query    string
	Page     int
	PageSize int
	// Sort: name | slug | usage ("-" prefix = desc); unknown/empty → name ASC.
	Sort string
}

// --- Response DTOs ---

// CategoryResponse is a category node in the category tree (children nested).
type CategoryResponse struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	// NameDisplay is Name in the language the request asked for, falling back
	// to Name itself. It is for SHOWING a category — a list, a picker, a
	// breadcrumb — and nothing else: the editor is hydrated from this same
	// list, so Name has to keep carrying the stored Vietnamese or the next
	// save would write the translation over it.
	NameDisplay  string             `json:"name_display"`
	Slug         string             `json:"slug"`
	ParentID     *uuid.UUID         `json:"parent_id"`
	Description  *string            `json:"description"`
	SortOrder    int                `json:"sort_order"`
	Status       string             `json:"status"`
	ArticleCount int                `json:"article_count"`
	SEO          CategorySEO        `json:"seo"`
	Children     []CategoryResponse `json:"children"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
}

// TagResponse is a tag with its article usage count.
type TagResponse struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	UsageCount int       `json:"usage_count"`
	CreatedAt  time.Time `json:"created_at"`
}

// toCategoryResponse converts one row. `tr` is the request locale's stored
// values for this category, nil when there are none — a write path passes nil,
// so a create/update answers with exactly what it persisted.
func toCategoryResponse(c categoryWithCount, tr map[string]any) CategoryResponse {
	return CategoryResponse{
		ID: c.ID, Name: c.Name, NameDisplay: localize.Str(tr, "name", c.Name),
		Slug: c.Slug, ParentID: c.ParentID,
		Description: c.Description, SortOrder: c.SortOrder, Status: c.Status, ArticleCount: c.ArticleCount,
		SEO:      CategorySEO{Title: c.SEOTitle, Description: c.SEODescription, Keywords: c.SEOKeywords},
		Children: []CategoryResponse{}, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
	}
}

// TagListResult is the paginated tag list envelope (mirrors ArticleListResult).
type TagListResult struct {
	Items    []TagResponse `json:"items"`
	Total    int           `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

// TagOption is a lightweight tag for selectors that need the full set (tag merge
// target, article-list tag filter) without usage counts or pagination.
type TagOption struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

func toTagResponse(t tagWithCount) TagResponse {
	return TagResponse{ID: t.ID, Name: t.Name, Slug: t.Slug, UsageCount: t.UsageCount, CreatedAt: t.CreatedAt}
}

func toTagOption(t Tag) TagOption {
	return TagOption{ID: t.ID, Name: t.Name, Slug: t.Slug}
}
