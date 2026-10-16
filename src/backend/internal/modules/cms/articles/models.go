// Package articles is the CMS article feature: a status-field editorial workflow
// (draft/pending_review/needs_revision/scheduled/published/archived), editor ABAC
// (own-only), m2m tags, category reference, and image upload. Slug-bearing. Its
// category/author/tag references are article-owned DTOs resolved by SQL join, so
// it references no other CMS feature's Go types.
package articles

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
)

const (
	permView   = "cms.article.view"
	permCreate = "cms.article.create"
	permEdit   = "cms.article.edit"
	permDelete = "cms.article.delete"
	permReview = "cms.article.review" // reviewer marker (admin-class): see all + approve/return
)

const maxArticlePageSize = 100

// Article status values (cms_articles.status CHECK).
const (
	ArticleStatusDraft         = "draft"
	ArticleStatusPendingReview = "pending_review"
	ArticleStatusNeedsRevision = "needs_revision"
	ArticleStatusScheduled     = "scheduled"
	ArticleStatusPublished     = "published"
	ArticleStatusArchived      = "archived"
)

// validArticleStatus is the set accepted by the list `status` filter.
var validArticleStatus = map[string]bool{
	ArticleStatusDraft: true, ArticleStatusPendingReview: true, ArticleStatusNeedsRevision: true,
	ArticleStatusScheduled: true, ArticleStatusPublished: true, ArticleStatusArchived: true,
}

// Article is a full article row (working copy + publish metadata). Tags are m2m.
type Article struct {
	ID                uuid.UUID
	Title             string
	Slug              string
	Excerpt           *string
	BodyHTML          *string
	BodyJSON          json.RawMessage
	CategoryID        *uuid.UUID
	AuthorID          uuid.UUID
	AuthorRole        string // reviewer-class at create → drives review gating
	Status            string
	ReviewNote        *string
	FeaturedPath      *string
	OGPath            *string
	SEOTitle          *string
	SEODescription    *string
	SEOKeywords       *string
	CanonicalURL      *string
	SEONoindex        bool
	SEONofollow       bool
	OGTitle           *string
	OGDescription     *string
	PublishedAt       *time.Time
	PublishedSnapshot json.RawMessage
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// articleWrite is the mutable working content (create/update). Status / author /
// publish metadata are set by dedicated transitions, never here.
type articleWrite struct {
	Title          string
	Slug           string
	Excerpt        *string
	BodyHTML       *string
	BodyJSON       json.RawMessage
	CategoryID     *uuid.UUID
	FeaturedPath   *string
	OGPath         *string
	SEOTitle       *string
	SEODescription *string
	SEOKeywords    *string
	CanonicalURL   *string
	SEONoindex     bool
	SEONofollow    bool
	OGTitle        *string
	OGDescription  *string
}

// CreateArticleRequest creates an article. Status defaults to draft; a non-draft
// status must be in the actor's create-set. publish_at required when scheduled.
type CreateArticleRequest struct {
	Title        string          `json:"title" validate:"required,max=300"`
	Slug         *string         `json:"slug" validate:"omitempty,max=300"`
	Status       *string         `json:"status" validate:"omitempty,oneof=draft pending_review needs_revision scheduled published archived"`
	PublishAt    *time.Time      `json:"publish_at"`
	Excerpt      *string         `json:"excerpt" validate:"omitempty,max=500"`
	BodyHTML     *string         `json:"body_html"`
	BodyJSON     json.RawMessage `json:"body_json"`
	CategoryID   *uuid.UUID      `json:"category_id"`
	TagIDs       []uuid.UUID     `json:"tag_ids" validate:"omitempty,max=50,dive,required"`
	FeaturedPath *string         `json:"featured_path" validate:"omitempty,max=500"`
	OGPath       *string         `json:"og_path" validate:"omitempty,max=500"`
	SEO          *shared.PageSEO `json:"seo"`
}

// UpdateArticleRequest patches an article (content + optional status transition).
type UpdateArticleRequest struct {
	UpdatedAt      *time.Time                 `json:"updated_at" validate:"required"`
	Title          *string                    `json:"title" validate:"omitempty,max=300"`
	Slug           *string                    `json:"slug" validate:"omitempty,max=300"`
	Status         *string                    `json:"status" validate:"omitempty,oneof=draft pending_review needs_revision scheduled published archived"`
	PublishAt      *time.Time                 `json:"publish_at"`
	Note           *string                    `json:"note" validate:"omitempty,max=1000"`
	Excerpt        *string                    `json:"excerpt" validate:"omitempty,max=500"`
	BodyHTML       *string                    `json:"body_html"`
	BodyJSON       json.RawMessage            `json:"body_json"`
	CategoryID     shared.Optional[uuid.UUID] `json:"category_id"`
	TagIDs         *[]uuid.UUID               `json:"tag_ids" validate:"omitempty,max=50,dive,required"`
	FeaturedPath   *string                    `json:"featured_path" validate:"omitempty,max=500"`
	OGPath         *string                    `json:"og_path" validate:"omitempty,max=500"`
	SEO            *shared.PageSEO            `json:"seo"`
	RegenerateSlug bool                       `json:"regenerate_slug"`
}

// ArticleListParams drives the paginated list (handler-parsed; service enforces
// ABAC + caps page_size).
type ArticleListParams struct {
	Query      string
	Status     string
	CategoryID *uuid.UUID
	Tag        string // tag slug
	AuthorID   *uuid.UUID
	// CreatedFrom/CreatedTo are the half-open instant bounds resolved by
	// httpx.QueryDateRange — CreatedTo is midnight after the requested day, so
	// the repository compares it with <.
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Page        int
	PageSize    int
	Sort        string
	// Locale is the language the console is reading in (Accept-Language), "" for
	// the source language. The list overlays the stored translation of the text
	// it shows; the article's own row is untouched.
	Locale string
}

// --- Response DTOs (article-owned, resolved by SQL join) ---

// ArticleAuthor is the author summary embedded in article responses.
type ArticleAuthor struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

// ArticleCategoryRef is the category summary embedded in article responses.
type ArticleCategoryRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// ArticleTagRef is one tag summary in an article response.
type ArticleTagRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// ArticleListItem is a single row in the article list response.
type ArticleListItem struct {
	ID          uuid.UUID           `json:"id"`
	Title       string              `json:"title"`
	Slug        string              `json:"slug"`
	Status      string              `json:"status"`
	Category    *ArticleCategoryRef `json:"category"`
	Author      ArticleAuthor       `json:"author"`
	PublishedAt *time.Time          `json:"published_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

// ArticleResponse is the full article detail returned by GET/{id} and mutations.
type ArticleResponse struct {
	ArticleListItem
	Excerpt           *string         `json:"excerpt"`
	BodyHTML          *string         `json:"body_html"`
	BodyJSON          json.RawMessage `json:"body_json"`
	Tags              []ArticleTagRef `json:"tags"`
	FeaturedURL       *string         `json:"featured_url"`
	OGURL             *string         `json:"og_url"`
	SEO               shared.PageSEO  `json:"seo"`
	ReviewNote        *string         `json:"review_note"`
	AuthorRole        string          `json:"author_role"`
	PublishedSnapshot json.RawMessage `json:"published_snapshot"`
	CreatedAt         time.Time       `json:"created_at"`
}

// ArticleListResult is the paginated list envelope.
type ArticleListResult struct {
	Items    []ArticleListItem `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

// articleListRow is one joined row from the list query.
type articleListRow struct {
	ID           uuid.UUID
	Title        string
	Slug         string
	Status       string
	CategoryID   *uuid.UUID
	CategoryName *string
	CategorySlug *string
	AuthorID     uuid.UUID
	AuthorName   string
	PublishedAt  *time.Time
	UpdatedAt    time.Time
}

// articleSnapshot is the public-facing subset frozen into published_snapshot.
type articleSnapshot struct {
	Title        string         `json:"title"`
	Slug         string         `json:"slug"`
	Excerpt      *string        `json:"excerpt"`
	BodyHTML     *string        `json:"body_html"`
	FeaturedPath *string        `json:"featured_path"`
	CategoryID   *uuid.UUID     `json:"category_id"`
	TagIDs       []uuid.UUID    `json:"tag_ids"`
	PublishedAt  *time.Time     `json:"published_at"`
	SEO          shared.PageSEO `json:"seo"`
	OGPath       *string        `json:"og_path"`
}

func articleSEOObj(a Article) shared.PageSEO {
	return shared.PageSEO{
		Title: a.SEOTitle, Description: a.SEODescription, Keywords: a.SEOKeywords,
		CanonicalURL: a.CanonicalURL, NoIndex: a.SEONoindex, NoFollow: a.SEONofollow,
		OGTitle: a.OGTitle, OGDescription: a.OGDescription,
	}
}

func toArticleListItem(r articleListRow) ArticleListItem {
	item := ArticleListItem{
		ID: r.ID, Title: r.Title, Slug: r.Slug, Status: r.Status,
		Author: ArticleAuthor{ID: r.AuthorID, Name: r.AuthorName}, PublishedAt: r.PublishedAt, UpdatedAt: r.UpdatedAt,
	}
	if r.CategoryID != nil {
		item.Category = &ArticleCategoryRef{ID: *r.CategoryID}
		if r.CategoryName != nil {
			item.Category.Name = *r.CategoryName
		}
		if r.CategorySlug != nil {
			item.Category.Slug = *r.CategorySlug
		}
	}
	return item
}
