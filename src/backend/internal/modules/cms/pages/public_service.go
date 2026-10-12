package pages

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

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

// publicReader is the read seam the public page service needs (PublicRepo
// satisfies it; a fake stands in for tests).
type publicReader interface {
	GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublicPage, error)
}

// localeLister is the one thing the public page read needs from the translation
// module: which languages exist. nil means Vietnamese only, which is also what
// the feature switched off looks like.
type localeLister interface {
	Locales(ctx context.Context) []string
}

// PublicBlock is a resolved inline widget for the public page view: stored config
// plus the data resolved fresh at read time (nil for static widgets / on resolve
// error).
type PublicBlock struct {
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config"`
	Data   any             `json:"data"`
}

// PublicAlternate is one language's address for this page, for hreflang.
//
// Slug rather than a full path: the backend does not own the site's URL layout,
// and guessing a prefix here would be a second place to keep it right.
type PublicAlternate struct {
	Locale   string `json:"locale"`
	Slug     string `json:"slug"`
	XDefault bool   `json:"x_default"`
}

// PublicPageResponse is the published, public-facing page (from the snapshot).
// InlineWidgets maps a body placeholder id (data-kd-widget) to its resolved
// widget, so the web can swap each placeholder in body_html.
type PublicPageResponse struct {
	Title         string                 `json:"title"`
	Slug          string                 `json:"slug"`
	Locale        string                 `json:"locale"`
	BodyHTML      *string                `json:"body_html"`
	OGPath        *string                `json:"og_path"`
	SEO           shared.PageSEO         `json:"seo"`
	InlineWidgets map[string]PublicBlock `json:"inline_widgets"`
	Sections      []shared.PublicSection `json:"sections"`
	Alternates    []PublicAlternate      `json:"alternates"`
}

// PublicService serves the published page read path (no auth).
type PublicService struct {
	repo     publicReader
	resolver *widgets.Resolver
	landing  LandingPort
	locales  localeLister
}

// NewPublicService wires the public page service with a widget resolver and the
// landing port (a page may attach a landing whose sections render inline).
func NewPublicService(repo publicReader, resolver *widgets.Resolver, landing LandingPort) *PublicService {
	return &PublicService{repo: repo, resolver: resolver, landing: landing}
}

// SetLocales wires the translation module's language list (called once at
// startup). Unset → Vietnamese only.
func (s *PublicService) SetLocales(l localeLister) { s.locales = l }

// resolveLocale maps the ?locale= parameter onto a language that is actually
// published. Anything unknown serves the original rather than an error: a
// visitor who mistypes a query parameter has not earned an error page.
func (s *PublicService) resolveLocale(ctx context.Context, raw string) string {
	want := strings.ToLower(strings.TrimSpace(raw))
	if want == "" || want == baseLocale || s.locales == nil {
		return baseLocale
	}
	for _, l := range s.locales.Locales(ctx) {
		if l == want {
			return want
		}
	}
	return baseLocale
}

// GetPublishedPage returns a published page by slug in the requested language,
// reading the frozen document and resolving each block's data fresh. A single
// block failing to resolve yields data:null for that block and never breaks the
// page.
//
// ErrMoved travels back to the handler untouched so it can answer 301; wrapping
// it in a 404 here would throw away the only thing that keeps an old link alive.
func (s *PublicService) GetPublishedPage(ctx context.Context, locale, slug string) (PublicPageResponse, error) {
	want := s.resolveLocale(ctx, locale)
	p, err := s.repo.GetPublishedBySlug(ctx, want, slug)
	if errors.Is(err, shared.ErrNotFound) {
		return PublicPageResponse{}, apperr.NotFound("not_found")
	}
	var moved ErrMoved
	if errors.As(err, &moved) {
		return PublicPageResponse{}, moved
	}
	if err != nil {
		return PublicPageResponse{}, apperr.Internal()
	}
	snap := p.Snapshot
	out := PublicPageResponse{
		Title: snap.Title, Slug: snap.Slug, Locale: want, BodyHTML: snap.BodyHTML,
		OGPath: snap.OGPath, SEO: snap.SEO,
		InlineWidgets: make(map[string]PublicBlock, len(snap.InlineWidgets)),
		Sections:      []shared.PublicSection{},
		Alternates:    make([]PublicAlternate, 0, len(p.Alternates)),
	}
	for _, r := range p.Alternates {
		out.Alternates = append(out.Alternates,
			PublicAlternate{Locale: r.Locale, Slug: r.Slug, XDefault: r.Locale == baseLocale})
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
