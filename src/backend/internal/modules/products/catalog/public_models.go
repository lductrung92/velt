package catalog

import "time"

// Public DTOs — what the site is allowed to see.
//
// These are NOT the admin Response. The published snapshot is a frozen copy of
// that struct, so it still carries storage keys (cover_path, og_path), the
// internal id, the editorial status and the curation sort order. Projecting
// through these types is what keeps those out of a public response: adding a
// field to the admin shape can never leak it here by accident.

// PublicCategoryRef is a category as the site renders it.
type PublicCategoryRef struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// PublicMemberRef is a developer credited on the product, with the role they
// held on THIS product rather than their general one.
type PublicMemberRef struct {
	Slug      string  `json:"slug"`
	FullName  string  `json:"full_name"`
	Role      *string `json:"role"`
	AvatarURL *string `json:"avatar_url"`
}

// PublicMediaItem is one gallery entry: an image or an embedded video, never
// both (the DB enforces the XOR).
type PublicMediaItem struct {
	Kind     string  `json:"kind"`
	URL      *string `json:"url"`
	VideoURL *string `json:"video_url"`
	Caption  *string `json:"caption"`
}

// PublicSEO is the meta block the site needs to render <head>.
type PublicSEO struct {
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	Keywords      *string `json:"keywords"`
	CanonicalURL  *string `json:"canonical_url"`
	Noindex       bool    `json:"noindex"`
	Nofollow      bool    `json:"nofollow"`
	OGTitle       *string `json:"og_title"`
	OGDescription *string `json:"og_description"`
	OGImageURL    *string `json:"og_image_url"`
}

// PublicListItem is a catalog row: enough to render a card, nothing more.
type PublicListItem struct {
	Slug       string              `json:"slug"`
	Name       string              `json:"name"`
	Summary    *string             `json:"summary"`
	CoverURL   *string             `json:"cover_url"`
	Lifecycle  string              `json:"lifecycle"`
	IsFeatured bool                `json:"is_featured"`
	Audience   []string            `json:"audience"`
	Platforms  []string            `json:"platforms"`
	Categories []PublicCategoryRef `json:"categories"`
}

// PublicListResponse is the paginated catalog.
type PublicListResponse struct {
	Items    []PublicListItem `json:"items"`
	Total    int              `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

// PublicDemo groups everything about trying the product before buying it.
type PublicDemo struct {
	URL          *string  `json:"url"`
	Access       *string  `json:"access"`
	Instructions []string `json:"instructions"`
}

// PublicDetail is the product page.
type PublicDetail struct {
	Slug       string  `json:"slug"`
	Name       string  `json:"name"`
	Summary    *string `json:"summary"`
	BodyHTML   *string `json:"body_html"`
	CoverURL   *string `json:"cover_url"`
	Lifecycle  string  `json:"lifecycle"`
	Version    *string `json:"version"`
	ReleasedAt *string `json:"released_at"`

	Audience   []string `json:"audience"`
	Platforms  []string `json:"platforms"`
	TechStack  []string `json:"tech_stack"`
	Highlights []string `json:"highlights"`
	IsFeatured bool     `json:"is_featured"`

	ProductURL *string    `json:"product_url"`
	Demo       PublicDemo `json:"demo"`

	SEO        PublicSEO           `json:"seo"`
	Categories []PublicCategoryRef `json:"categories"`
	Members    []PublicMemberRef   `json:"members"`
	Gallery    []PublicMediaItem   `json:"gallery"`

	PublishedAt *time.Time `json:"published_at"`
}

// PublicListParams is the resolved public query. There is deliberately no
// Status field: the site must not be able to ask for drafts.
type PublicListParams struct {
	Query     string
	Category  string // category slug
	Lifecycle string
	Audience  string
	Platform  string
	Featured  *bool
	Sort      string // "featured" (default) | "name" | "newest"
	Page      int
	PageSize  int
}
