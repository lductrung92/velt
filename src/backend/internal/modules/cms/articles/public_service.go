package articles

import (
	"context"
	"errors"
	"strings"
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
	GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublicArticle, error)
}

// localeLister is the one thing the public blog needs from the translation
// module: which languages exist. nil means Vietnamese only, which is also what
// the feature switched off looks like.
type localeLister interface {
	Locales(ctx context.Context) []string
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
	Slug        string            `json:"slug"`
	Locale      string            `json:"locale"`
	Title       string            `json:"title"`
	Excerpt     *string           `json:"excerpt"`
	BodyHTML    *string           `json:"body_html"`
	CoverURL    *string           `json:"cover_url"`
	PublishedAt *time.Time        `json:"published_at"`
	SEO         shared.PageSEO    `json:"seo"`
	Alternates  []PublicAlternate `json:"alternates"`
}

// PublicAlternate is one language's address for this article, for hreflang.
//
// Slug rather than a full path: the backend does not own the site's URL layout,
// and guessing a prefix here would be a second place to keep it right.
type PublicAlternate struct {
	Locale   string `json:"locale"`
	Slug     string `json:"slug"`
	XDefault bool   `json:"x_default"`
}

// PublicService serves published articles for the public web (no auth).
type PublicService struct {
	repo    publicReader
	files   storage.Storage
	locales localeLister
}

// NewPublicService builds the public blog service.
func NewPublicService(repo publicReader, files storage.Storage) *PublicService {
	return &PublicService{repo: repo, files: files}
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
func (s *PublicService) ListPublished(ctx context.Context, locale, query, sort string, page, pageSize int) (PublicArticleList, error) {
	page, pageSize = normalizePublicPage(page, pageSize)
	cards, total, err := s.repo.ListPublishedPage(ctx, PublicListFilter{
		Locale: s.resolveLocale(ctx, locale), Query: query, Sort: normalizePublicSort(sort),
		Limit: pageSize, Offset: (page - 1) * pageSize,
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
//
// ErrMoved travels back to the handler untouched so it can answer 301; wrapping
// it in a 404 here would throw away the only thing that keeps an old link alive.
func (s *PublicService) GetBySlug(ctx context.Context, locale, slug string) (PublicArticleDetail, error) {
	want := s.resolveLocale(ctx, locale)
	a, err := s.repo.GetPublishedBySlug(ctx, want, slug)
	if errors.Is(err, shared.ErrNotFound) {
		return PublicArticleDetail{}, apperr.NotFound("not_found")
	}
	var moved ErrMoved
	if errors.As(err, &moved) {
		return PublicArticleDetail{}, moved
	}
	if err != nil {
		return PublicArticleDetail{}, apperr.Internal()
	}
	alts := make([]PublicAlternate, 0, len(a.Alternates))
	for _, r := range a.Alternates {
		alts = append(alts, PublicAlternate{Locale: r.Locale, Slug: r.Slug, XDefault: r.Locale == baseLocale})
	}
	return PublicArticleDetail{
		Slug: a.Slug, Locale: want, Title: a.Title, Excerpt: a.Excerpt, BodyHTML: a.BodyHTML,
		CoverURL: s.fileURL(ctx, a.FeaturedPath), PublishedAt: a.PublishedAt,
		SEO: a.SEO, Alternates: alts,
	}, nil
}

func (s *PublicService) fileURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := s.files.URL(ctx, *path)
	return &u
}
