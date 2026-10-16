package landing

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/platform/media"
	"github.com/velt/backend/internal/platform/storage"
)

// PublicService resolves a published landing's sections for the public read path
// (no auth). It is consumed in-process by the pages feature (a page attaches a
// landing) via the pages.LandingPort interface — no HTTP endpoint of its own.
type PublicService struct {
	repo     Repository
	resolver *widgets.Resolver
	files    storage.Storage
	tr       Translator
	// assets upgrades a section's stored image paths to their flat /img address
	// and attaches the size recorded for them; nil until wired, nil answers
	// nothing and the sections carry the legacy URLs.
	assets *media.PublicURLs
}

// NewPublicService wires the public landing service.
func NewPublicService(repo Repository, resolver *widgets.Resolver, files storage.Storage) *PublicService {
	return &PublicService{repo: repo, resolver: resolver, files: files}
}

// SetMediaURLs wires the read-path media mapping (called once at startup).
func (s *PublicService) SetMediaURLs(m *media.PublicURLs) { s.assets = m }

// ResolvePublishedSections returns the frozen (visible) sections of a PUBLISHED
// landing, with media *_path→*_url injected and dynamic sections
// (featured_articles / categories_showcase) resolved fresh. A landing that is
// missing or not published yields nil (the hosting page renders without sections);
// a single dynamic section failing to resolve yields data:null, never an error.
func (s *PublicService) ResolvePublishedSections(ctx context.Context, id uuid.UUID) ([]shared.PublicSection, error) {
	return s.ResolvePublishedSectionsIn(ctx, id, "")
}

// ResolvePublishedSectionsIn is the same read in one language: each section's
// frozen config is overlaid with whatever of it somebody has translated. An
// empty locale, a language with no copy, or a field left blank all keep the
// published text — a half-translated page reads as the original rather than as
// a gap.
func (s *PublicService) ResolvePublishedSectionsIn(ctx context.Context, id uuid.UUID, locale string) ([]shared.PublicSection, error) {
	p, err := s.repo.GetLanding(ctx, id)
	if err != nil {
		if errors.Is(err, shared.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if p.Status != LandingStatusPublished || len(p.PublishedSnapshot) == 0 {
		return nil, nil
	}
	var snap landingSnapshot
	if err := json.Unmarshal(p.PublishedSnapshot, &snap); err != nil {
		return nil, nil
	}
	byID := s.sectionTranslations(ctx, snap.Sections, locale)
	configs := make([]json.RawMessage, 0, len(snap.Sections))
	for _, sec := range snap.Sections {
		configs = append(configs, sec.Config)
	}
	// One lookup for every image on the page, not one per section.
	found := s.assets.Resolve(ctx, configMediaPaths(configs))
	out := make([]shared.PublicSection, 0, len(snap.Sections))
	for _, sec := range snap.Sections {
		config := sec.Config
		if values, ok := byID[sec.ID]; ok {
			config = translatedConfig(config, values)
		}
		out = append(out, shared.PublicSection{
			Type:      sec.Type,
			SortOrder: sec.SortOrder,
			Config:    resolveConfigMediaURLs(ctx, s.files, found, config),
			// The DATA a dynamic section pulls in (articles, members, products)
			// is read in the language of the request by the resolver itself;
			// only the words around it come from here.
			Data: s.resolveSectionData(ctx, sec.Type, config, locale),
		})
	}
	return out, nil
}

// resolveSectionData maps a dynamic landing section to the widget resolver (the
// section config shares its filters/limit shape). Static sections return nil.
func (s *PublicService) resolveSectionData(ctx context.Context, typ string, config json.RawMessage, locale string) any {
	var widgetType string
	switch typ {
	case SectionFeaturedArticles:
		widgetType = widgets.TypeArticlesList
	case SectionCategoriesShowcase:
		widgetType = widgets.TypeCategoriesShowcase
	case SectionProductGrid:
		widgetType = widgets.TypeProductGrid
	case SectionTeam:
		widgetType = widgets.TypeTeam
	default:
		return nil
	}
	// A snapshot can predate the current sanitizer, or be hand-edited in the DB,
	// so its config is not guaranteed to be a JSON object. The resolver would read
	// zero-value filters out of such a config and answer with a list nobody asked
	// for; null is the honest answer and still renders the section.
	if !isConfigObject(config) {
		return nil
	}
	data, err := s.resolver.ResolveIn(ctx, widgetType, config, locale)
	if err != nil {
		return nil
	}
	return data
}

// isConfigObject reports whether a frozen section config is a JSON object.
func isConfigObject(config json.RawMessage) bool {
	var m map[string]json.RawMessage
	return json.Unmarshal(config, &m) == nil && m != nil
}

// sectionTranslations loads one language's copy of every section on the page,
// in one query. A failure is not an error: the page is served as published.
func (s *PublicService) sectionTranslations(
	ctx context.Context,
	sections []sectionSnapshot,
	locale string,
) map[uuid.UUID]map[string]any {
	if s.tr == nil || locale == "" {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(sections))
	for _, sec := range sections {
		if sec.ID != uuid.Nil {
			ids = append(ids, sec.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	bundle, err := s.tr.Bundle(ctx, EntityLandingSection, ids, []string{locale})
	if err != nil {
		return nil
	}
	out := make(map[uuid.UUID]map[string]any, len(bundle))
	for id, byLocale := range bundle {
		if values := byLocale[locale]; len(values) > 0 {
			out[id] = values
		}
	}
	return out
}
