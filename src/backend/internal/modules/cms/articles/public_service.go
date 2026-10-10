package articles

import (
	"context"
	"errors"
	"time"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/storage"
)

const (
	publicDefaultPageSize = 12
	publicMaxPageSize     = 48
)

// publicReader is the read seam the public blog service needs (PublicRepo
// satisfies it; a fake stands in for tests).
type publicReader interface {
	ListPublishedPage(ctx context.Context, f PublicListFilter) ([]PublicCard, int, error)
	GetPublishedBySlug(ctx context.Context, slug string) (*PublicArticle, error)
}

// PublicArticleCard is a published-article card for the public blog list.
type PublicArticleCard struct {
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Excerpt     *string    `json:"excerpt"`
	CoverURL    *string    `json:"cover_url"`
	PublishedAt *time.Time `json:"published_at"`
}

// PublicArticleList is the paginated public blog list.
type PublicArticleList struct {
	Items    []PublicArticleCard `json:"items"`
	Total    int                 `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

// PublicArticleDetail is the public article detail (blog post).
type PublicArticleDetail struct {
	Slug        string         `json:"slug"`
	Title       string         `json:"title"`
	Excerpt     *string        `json:"excerpt"`
	BodyHTML    *string        `json:"body_html"`
	CoverURL    *string        `json:"cover_url"`
	PublishedAt *time.Time     `json:"published_at"`
	SEO         shared.PageSEO `json:"seo"`
}

// PublicService serves published articles for the public web (no auth).
type PublicService struct {
	repo  publicReader
	files storage.Storage
}

// NewPublicService builds the public blog service.
func NewPublicService(repo publicReader, files storage.Storage) *PublicService {
	return &PublicService{repo: repo, files: files}
}

func normalizePublicPage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = publicDefaultPageSize
	}
	if pageSize > publicMaxPageSize {
		pageSize = publicMaxPageSize
	}
	return page, pageSize
}

func normalizePublicSort(sort string) string {
	switch sort {
	case "oldest", "title":
		return sort
	default:
		return "newest"
	}
}

// ListPublished returns a page of published article cards (newest first by
// default), optionally narrowed by a free-text query.
func (s *PublicService) ListPublished(ctx context.Context, query, sort string, page, pageSize int) (PublicArticleList, error) {
	page, pageSize = normalizePublicPage(page, pageSize)
	cards, total, err := s.repo.ListPublishedPage(ctx, PublicListFilter{
		Query: query, Sort: normalizePublicSort(sort), Limit: pageSize, Offset: (page - 1) * pageSize,
	})
	if err != nil {
		return PublicArticleList{}, apperr.Internal()
	}
	items := make([]PublicArticleCard, len(cards))
	for i := range cards {
		items[i] = PublicArticleCard{
			Slug: cards[i].Slug, Title: cards[i].Title, Excerpt: cards[i].Excerpt,
			CoverURL: s.fileURL(ctx, cards[i].FeaturedPath), PublishedAt: cards[i].PublishedAt,
		}
	}
	return PublicArticleList{Items: items, Total: total, Page: page, PageSize: pageSize}, nil
}

// GetBySlug returns one published article (blog post) by slug.
func (s *PublicService) GetBySlug(ctx context.Context, slug string) (PublicArticleDetail, error) {
	a, err := s.repo.GetPublishedBySlug(ctx, slug)
	if errors.Is(err, shared.ErrNotFound) {
		return PublicArticleDetail{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return PublicArticleDetail{}, apperr.Internal()
	}
	return PublicArticleDetail{
		Slug: a.Slug, Title: a.Title, Excerpt: a.Excerpt, BodyHTML: a.BodyHTML,
		CoverURL: s.fileURL(ctx, a.FeaturedPath), PublishedAt: a.PublishedAt,
		SEO: shared.PageSEO{
			Title: a.SEOTitle, Description: a.SEODescription, CanonicalURL: a.CanonicalURL,
			OGTitle: a.OGTitle, OGDescription: a.OGDescription,
		},
	}, nil
}

func (s *PublicService) fileURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.files.URL(ctx, *path)
	return &u
}
