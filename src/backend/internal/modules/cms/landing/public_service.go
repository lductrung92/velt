package landing

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/platform/storage"
)

// PublicService resolves a published landing's sections for the public read path
// (no auth). It is consumed in-process by the pages feature (a page attaches a
// landing) via the pages.LandingPort interface — no HTTP endpoint of its own.
type PublicService struct {
	repo     Repository
	resolver *widgets.Resolver
	files    storage.Storage
}

// NewPublicService wires the public landing service.
func NewPublicService(repo Repository, resolver *widgets.Resolver, files storage.Storage) *PublicService {
	return &PublicService{repo: repo, resolver: resolver, files: files}
}

// ResolvePublishedSections returns the frozen (visible) sections of a PUBLISHED
// landing, with media *_path→*_url injected and dynamic sections
// (featured_articles / categories_showcase) resolved fresh. A landing that is
// missing or not published yields nil (the hosting page renders without sections);
// a single dynamic section failing to resolve yields data:null, never an error.
func (s *PublicService) ResolvePublishedSections(ctx context.Context, id uuid.UUID) ([]shared.PublicSection, error) {
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
	out := make([]shared.PublicSection, 0, len(snap.Sections))
	for _, sec := range snap.Sections {
		out = append(out, shared.PublicSection{
			Type:      sec.Type,
			SortOrder: sec.SortOrder,
			Config:    resolveConfigMediaURLs(ctx, s.files, sec.Config),
			Data:      s.resolveSectionData(ctx, sec.Type, sec.Config),
		})
	}
	return out, nil
}

// resolveSectionData maps a dynamic landing section to the widget resolver (the
// section config shares its filters/limit shape). Static sections return nil.
func (s *PublicService) resolveSectionData(ctx context.Context, typ string, config json.RawMessage) any {
	var widgetType string
	switch typ {
	case SectionFeaturedArticles:
		widgetType = widgets.TypeArticlesList
	case SectionCategoriesShowcase:
		widgetType = widgets.TypeCategoriesShowcase
	default:
		return nil
	}
	data, err := s.resolver.Resolve(ctx, widgetType, config)
	if err != nil {
		return nil
	}
	return data
}
