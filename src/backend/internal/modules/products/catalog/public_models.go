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
	Slug         string  `json:"slug"`
	FullName     string  `json:"full_name"`
	Role         *string `json:"role"`
	AvatarURL    *string `json:"avatar_url"`
	AvatarWidth  int     `json:"avatar_width,omitempty"`
	AvatarHeight int     `json:"avatar_height,omitempty"`
}

// PublicMediaItem is one gallery entry: an image or an embedded video, never
// both (the DB enforces the XOR).
type PublicMediaItem struct {
	Kind     string  `json:"kind"`
	URL      *string `json:"url"`
	Width    int     `json:"width,omitempty"`
	Height   int     `json:"height,omitempty"`
	VideoURL *string `json:"video_url"`
	Caption  *string `json:"caption"`
	// Which device tab the site files this under. Null means nobody has said;
	// the site decides what to do with those rather than guessing a device
	// from the caption, which is what it used to do (migration 0052).
	Device *string `json:"device"`
	// The capture the hero shows for that device, chosen in the console.
	IsHero bool `json:"is_hero,omitempty"`
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
	OGImageWidth  int     `json:"og_image_width,omitempty"`
	OGImageHeight int     `json:"og_image_height,omitempty"`
}

// PublicListItem is a catalog row: enough to render a card, nothing more.
//
// The *_width/*_height siblings that appear beside every image URL in this file
// are the asset's intrinsic pixel size, sent only when the image has a `files`
// row. They let the site reserve the space before the bytes land (design §1,
// CLS); absent, the image is one nothing was recorded about and the site sizes
// it the way it did before.
type PublicListItem struct {
	Slug        string              `json:"slug"`
	Name        string              `json:"name"`
	Summary     *string             `json:"summary"`
	CoverURL    *string             `json:"cover_url"`
	CoverWidth  int                 `json:"cover_width,omitempty"`
	CoverHeight int                 `json:"cover_height,omitempty"`
	Lifecycle   string              `json:"lifecycle"`
	IsFeatured  bool                `json:"is_featured"`
	Audience    []string            `json:"audience"`
	Platforms   []string            `json:"platforms"`
	Categories  []PublicCategoryRef `json:"categories"`
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

// PublicAlternate is one language's address for this product, for hreflang.
//
// Slug rather than a full path: the backend does not own the site's URL layout,
// and guessing a prefix here would be a second place to keep it right.
type PublicAlternate struct {
	Locale   string `json:"locale"`
	Slug     string `json:"slug"`
	XDefault bool   `json:"x_default"`
}

// PublicDetail is the product page.
type PublicDetail struct {
	Slug        string  `json:"slug"`
	Locale      string  `json:"locale"`
	Name        string  `json:"name"`
	Summary     *string `json:"summary"`
	BodyHTML    *string `json:"body_html"`
	CoverURL    *string `json:"cover_url"`
	CoverWidth  int     `json:"cover_width,omitempty"`
	CoverHeight int     `json:"cover_height,omitempty"`
	Lifecycle   string  `json:"lifecycle"`
	Version     *string `json:"version"`
	ReleasedAt  *string `json:"released_at"`

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
	// Alternates lists every language this product is published in, the one
	// being read included: hreflang is ignored unless each version points at the
	// others AND at itself.
	Alternates []PublicAlternate `json:"alternates"`
}

// PublicListParams is the resolved public query. There is deliberately no
// Status field: the site must not be able to ask for drafts.
type PublicListParams struct {
	Locale    string // the service resolves it; "" means the source language
	Query     string
	Category  string // category slug
	Lifecycle string
	Audience  string
	Platform  string
	Featured  *bool
	Sort      string // "featured" (default) | "name" | "newest" | "random"
	Page      int
	PageSize  int
}
