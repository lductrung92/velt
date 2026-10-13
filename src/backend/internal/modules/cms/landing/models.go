// Package landing is the CMS landing-page builder: landing pages
// (cms_landing_pages) and their ordered sections (cms_landing_sections),
// publish/unpublish with a frozen snapshot. Section configs are opaque JSON
// validated/sanitized per type; dynamic refs resolve at the public API, so this
// package references no other CMS feature's types.
package landing

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// permManage gates every landing endpoint.
const permManage = "cms.landing.manage"

// Landing status values (cms_landing_pages.status CHECK). Admin-only, no review.
const (
	LandingStatusDraft     = "draft"
	LandingStatusPublished = "published"
)

// Section types (cms_landing_sections.type CHECK) — 19 kinds.
const (
	SectionHero               = "hero"
	SectionSlider             = "slider"
	SectionFeaturedArticles   = "featured_articles"
	SectionCategoriesShowcase = "categories_showcase"
	SectionRichText           = "rich_text"
	SectionCTABanner          = "cta_banner"
	SectionTestimonials       = "testimonials"
	SectionLogos              = "logos"
	SectionStats              = "stats"
	SectionMediaText          = "media_text"
	SectionNewsletter         = "newsletter"
	SectionFAQ                = "faq"
	SectionGallery            = "gallery"
	SectionHTMLEmbed          = "html_embed"

	// The five sections the Zukatek home page was hand-built from, lifted into the
	// builder so the console can order, toggle and fill them. product_grid/team are
	// dynamic (data resolved fresh at read time); the rest carry their content in
	// config.
	SectionAudiencePicker = "audience_picker"
	SectionProductGrid    = "product_grid"
	SectionTeam           = "team"
	SectionBuyingSteps    = "buying_steps"
	SectionContactForm    = "contact_form"
)

// Page is a cms_landing_pages row (SEO columns mirror page/article).
type Page struct {
	ID                uuid.UUID
	Key               string
	Name              string
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
	PublishedSnapshot json.RawMessage
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// landingWrite is the mutable landing content (create/update). status/snapshot
// change via publish/unpublish only.
type landingWrite struct {
	Key            string
	Name           string
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

// Section is a cms_landing_sections row.
type Section struct {
	ID            uuid.UUID
	LandingPageID uuid.UUID
	Type          string
	SortOrder     int
	IsVisible     bool
	Config        json.RawMessage
}

// --- Requests ---

// CreateLandingRequest creates a landing page. key is UNIQUE.
type CreateLandingRequest struct {
	Key    string          `json:"key" validate:"required,max=100"`
	Name   string          `json:"name" validate:"required,max=200"`
	OGPath *string         `json:"og_path" validate:"omitempty,max=500"`
	SEO    *shared.PageSEO `json:"seo"`
}

// UpdateLandingRequest patches a landing page (key/name/seo/og — whole-object seo).
// updated_at carries the row version the client last read; the repo guards on it
// (optimistic lock) so concurrent edits surface a 409 instead of silently
// last-writer-wins — consistent with pages/categories/articles.
type UpdateLandingRequest struct {
	Key       *string         `json:"key" validate:"omitempty,max=100"`
	Name      *string         `json:"name" validate:"omitempty,max=200"`
	OGPath    *string         `json:"og_path" validate:"omitempty,max=500"`
	SEO       *shared.PageSEO `json:"seo"`
	UpdatedAt *time.Time      `json:"updated_at" validate:"required"`
}

// CreateSectionRequest adds a section. config is validated/sanitized per type.
type CreateSectionRequest struct {
	Type      string          `json:"type" validate:"required,oneof=hero slider featured_articles categories_showcase rich_text cta_banner testimonials logos stats media_text newsletter faq gallery html_embed audience_picker product_grid team buying_steps contact_form"`
	Config    json.RawMessage `json:"config"`
	IsVisible *bool           `json:"is_visible"`
}

// UpdateSectionRequest patches a section (config and/or visibility).
type UpdateSectionRequest struct {
	Config    json.RawMessage `json:"config"`
	IsVisible *bool           `json:"is_visible"`
}

// ReorderSectionsRequest sets the section order for a landing page.
type ReorderSectionsRequest struct {
	SectionIDs []uuid.UUID `json:"section_ids" validate:"required,dive,required"`
}

// --- Responses ---

// Response is a landing page (no sections) — the list shape.
type Response struct {
	ID        uuid.UUID      `json:"id"`
	Key       string         `json:"key"`
	Name      string         `json:"name"`
	Status    string         `json:"status"`
	OGURL     *string        `json:"og_url"`
	SEO       shared.PageSEO `json:"seo"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// SectionResponse is one builder section.
type SectionResponse struct {
	ID        uuid.UUID       `json:"id"`
	Type      string          `json:"type"`
	SortOrder int             `json:"sort_order"`
	IsVisible bool            `json:"is_visible"`
	Config    json.RawMessage `json:"config"`
}

// DetailResponse is a landing page + its sections (builder data).
type DetailResponse struct {
	Response
	Sections []SectionResponse `json:"sections"`
}

func landingSEOObj(p Page) shared.PageSEO {
	return shared.PageSEO{
		Title: p.SEOTitle, Description: p.SEODescription, Keywords: p.SEOKeywords,
		CanonicalURL: p.CanonicalURL, NoIndex: p.SEONoindex, NoFollow: p.SEONofollow,
		OGTitle: p.OGTitle, OGDescription: p.OGDescription,
	}
}

func toSectionResponse(s Section) SectionResponse {
	cfg := s.Config
	if len(cfg) == 0 {
		cfg = json.RawMessage(`{}`)
	}
	return SectionResponse{ID: s.ID, Type: s.Type, SortOrder: s.SortOrder, IsVisible: s.IsVisible, Config: cfg}
}

// landingSnapshot is the public-facing subset frozen on publish (visible sections
// + SEO). Dynamic refs (article/category ids inside config) resolve fresh at the
// public API, not from this snapshot.
type landingSnapshot struct {
	Key      string            `json:"key"`
	Name     string            `json:"name"`
	SEO      shared.PageSEO    `json:"seo"`
	OGPath   *string           `json:"og_path"`
	Sections []sectionSnapshot `json:"sections"`
}

type sectionSnapshot struct {
	Type      string          `json:"type"`
	SortOrder int             `json:"sort_order"`
	Config    json.RawMessage `json:"config"`
}
