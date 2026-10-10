package pages

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// LandingPort resolves the published sections of a landing a page attaches. It is
// satisfied in-process by landing.PublicService; declared here so pages does not
// import the landing package. A nil port (or nil landing) yields no sections.
type LandingPort interface {
	ResolvePublishedSections(ctx context.Context, id uuid.UUID) ([]shared.PublicSection, error)
}

// PublicBlock is a resolved inline widget for the public page view: stored config
// plus the data resolved fresh at read time (nil for static widgets / on resolve
// error).
type PublicBlock struct {
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config"`
	Data   any             `json:"data"`
}

// PublicPageResponse is the published, public-facing page (from the snapshot).
// InlineWidgets maps a body placeholder id (data-kd-widget) to its resolved
// widget, so the web can swap each placeholder in body_html.
type PublicPageResponse struct {
	Title         string                 `json:"title"`
	Slug          string                 `json:"slug"`
	BodyHTML      *string                `json:"body_html"`
	OGPath        *string                `json:"og_path"`
	SEO           shared.PageSEO         `json:"seo"`
	InlineWidgets map[string]PublicBlock `json:"inline_widgets"`
	Sections      []shared.PublicSection `json:"sections"`
}

// PublicService serves the published page read path (no auth).
type PublicService struct {
	repo     Repository
	resolver *widgets.Resolver
	landing  LandingPort
}

// NewPublicService wires the public page service with a widget resolver and the
// landing port (a page may attach a landing whose sections render inline).
func NewPublicService(repo Repository, resolver *widgets.Resolver, landing LandingPort) *PublicService {
	return &PublicService{repo: repo, resolver: resolver, landing: landing}
}

// GetPublishedPage returns a published page by slug, reading the frozen snapshot
// and resolving each block's data fresh. A single block failing to resolve yields
// data:null for that block and never breaks the page.
func (s *PublicService) GetPublishedPage(ctx context.Context, slug string) (PublicPageResponse, error) {
	p, err := s.repo.GetPublishedPageBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return PublicPageResponse{}, apperr.NotFound("not_found")
		}
		return PublicPageResponse{}, apperr.Internal()
	}
	var snap pageSnapshot
	if len(p.PublishedSnapshot) > 0 {
		_ = json.Unmarshal(p.PublishedSnapshot, &snap)
	}
	out := PublicPageResponse{
		Title: snap.Title, Slug: snap.Slug, BodyHTML: snap.BodyHTML,
		OGPath: snap.OGPath, SEO: snap.SEO,
		InlineWidgets: make(map[string]PublicBlock, len(snap.InlineWidgets)),
		Sections:      []shared.PublicSection{},
	}
	for _, iw := range snap.InlineWidgets {
		data, derr := s.resolver.Resolve(ctx, iw.Type, iw.Config)
		if derr != nil {
			data = nil
		}
		out.InlineWidgets[iw.Wid] = PublicBlock{Type: iw.Type, Config: iw.Config, Data: data}
	}
	// A page may attach a published landing; its builder sections render inline.
	// Resolve failures never break the page — it just renders without sections.
	if snap.LandingID != nil && s.landing != nil {
		if secs, derr := s.landing.ResolvePublishedSections(ctx, *snap.LandingID); derr == nil && secs != nil {
			out.Sections = secs
		}
	}
	return out, nil
}
