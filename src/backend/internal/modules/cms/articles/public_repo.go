package articles

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// PublicCard is a published-article card for public widgets and the blog list.
// FeaturedPath is populated by ListPublishedPage (blog) and left nil by the
// widget query.
type PublicCard struct {
	Slug         string
	Title        string
	Excerpt      *string
	PublishedAt  *time.Time
	FeaturedPath *string
}

// PublicFilter narrows the published-article list for a widget.
type PublicFilter struct {
	CategoryID *uuid.UUID
	Tag        string
	Limit      int
	// Locale is the language the card is read in. Empty, or a language the
	// article was never published in, serves the Vietnamese copy — the same
	// rule the rest of the public surface follows.
	Locale string
}

// PublicRepo reads published articles for public consumption (no auth) — a
// separate seam from the admin Repository so widget resolvers can fetch fresh
// cards without touching the editorial surface.
//
// The blog list and detail read the shared public read model (published_docs),
// which is where the published copy and its translations live. The widget query
// below still reads cms_articles directly: widgets are Vietnamese-only for now,
// and moving them is a separate change.
type PublicRepo struct {
	pool *pgxpool.Pool
	docs *pubdocs.Store
}

// NewPublicRepository builds the public-read article repo.
func NewPublicRepository(pool *pgxpool.Pool, docs *pubdocs.Store) *PublicRepo {
	return &PublicRepo{pool: pool, docs: docs}
}

// ListPublished returns up to Limit published articles (newest first), optionally
// filtered by category id and/or tag slug.
func (r *PublicRepo) ListPublished(ctx context.Context, f PublicFilter) ([]PublicCard, error) {
	conds := []string{"a.status = 'published'"}
	args := []any{}
	if f.CategoryID != nil {
		args = append(args, *f.CategoryID)
		conds = append(conds, fmt.Sprintf("a.category_id = $%d", len(args)))
	}
	if f.Tag != "" {
		args = append(args, f.Tag)
		conds = append(conds, fmt.Sprintf(
			"EXISTS (SELECT 1 FROM cms_article_tags xt JOIN cms_tags t ON t.id = xt.tag_id WHERE xt.article_id = a.id AND t.slug = $%d)",
			len(args)))
	}
	limit := f.Limit
	if limit < 1 || limit > 24 {
		limit = 6
	}
	args = append(args, limit)
	limitArg := len(args)
	// The card is read from the PUBLISHED copy in the requested language when
	// there is one: its title, its summary and — this is the part that matters
	// for a link — its slug, which is translated with the article.
	args = append(args, f.Locale)
	q := `SELECT COALESCE(pd.slug, a.slug),
	             COALESCE(NULLIF(pd.body ->> 'title', ''), a.title),
	             COALESCE(NULLIF(pd.body ->> 'excerpt', ''), a.excerpt),
	             a.published_at
	        FROM cms_articles a
	        LEFT JOIN published_docs pd
	               ON pd.entity = 'article' AND pd.entity_id = a.id
	              AND pd.locale = $` + fmt.Sprint(len(args)) + `
	              AND pd.is_current AND pd.body IS NOT NULL
	       WHERE ` + strings.Join(conds, " AND ") +
		` ORDER BY a.published_at DESC NULLS LAST ` + fmt.Sprintf(`LIMIT $%d`, limitArg)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list published articles: %w", err)
	}
	defer rows.Close()
	out := []PublicCard{}
	for rows.Next() {
		var c PublicCard
		if err := rows.Scan(&c.Slug, &c.Title, &c.Excerpt, &c.PublishedAt); err != nil {
			return nil, fmt.Errorf("scan published article: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// PublicListFilter parameterizes the paginated public blog list.
type PublicListFilter struct {
	Locale string // caller pre-validates; "" is never passed
	Query  string
	Sort   string // newest | oldest | title (caller pre-validates)
	Limit  int
	Offset int
}

// PublicArticle is one published article for the public detail (blog post) page.
type PublicArticle struct {
	Slug         string
	Title        string
	Excerpt      *string
	BodyHTML     *string
	FeaturedPath *string
	PublishedAt  *time.Time
	SEO          shared.PageSEO
	// Alternates is every language this article is published in, including the
	// one being viewed: hreflang is ignored unless each version points at the
	// others AND at itself.
	Alternates []pubdocs.Ref
}

// ErrMoved reports that the requested slug is no longer the article's address.
// The caller answers 301 rather than 404, so links already handed out survive a
// slug change and the ranking that URL earned is not thrown away.
type ErrMoved struct{ Slug string }

func (e ErrMoved) Error() string { return "article moved to " + e.Slug }

// ListPublishedPage returns one page of published articles (with total match
// count) for the blog, optionally narrowed by a free-text query.
//
// The query runs against published_docs.search_text, which is indexed with
// pg_trgm, so it matches the language being read and no longer scans the table.
func (r *PublicRepo) ListPublishedPage(ctx context.Context, f PublicListFilter) ([]PublicCard, int, error) {
	bodies, total, err := r.docs.List(ctx, pubdocs.ListParams{
		Entity: EntityArticle, Locale: f.Locale, Query: f.Query, Sort: f.Sort,
		TitleField: "title", Limit: f.Limit, Offset: f.Offset,
	})
	if err != nil {
		return nil, 0, err
	}
	out := make([]PublicCard, 0, len(bodies))
	for _, raw := range bodies {
		var d articleSnapshot
		if err := json.Unmarshal(raw, &d); err != nil {
			return nil, 0, fmt.Errorf("decode published article card: %w", err)
		}
		out = append(out, PublicCard{
			Slug: d.Slug, Title: d.Title, Excerpt: d.Excerpt,
			PublishedAt: d.PublishedAt, FeaturedPath: d.FeaturedPath,
		})
	}
	return out, total, nil
}

// GetPublishedBySlug returns one published article in the requested language.
//
// Three outcomes besides the article: shared.ErrNotFound, and ErrMoved either
// because the slug was retired by a rename, or because it is another language's
// address for the same article. Both get a 301 instead of a 404, which is what
// keeps one piece of content from living at two indexable URLs.
func (r *PublicRepo) GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublicArticle, error) {
	found, err := r.docs.Get(ctx, EntityArticle, locale, slug)
	if errors.Is(err, pubdocs.ErrNotFound) {
		return nil, r.crossLocaleRedirect(ctx, locale, slug)
	}
	if err != nil {
		return nil, err
	}
	if !found.IsCurrent {
		return nil, ErrMoved{Slug: found.CurrentSlug}
	}
	return r.decodeArticle(ctx, found)
}

// crossLocaleRedirect handles a slug that exists, but belongs to a different
// language of the same article — the case where a visitor lands on /en/<the
// Vietnamese slug> after a translated slug was set. It always returns an error.
func (r *PublicRepo) crossLocaleRedirect(ctx context.Context, locale, slug string) error {
	if locale == baseLocale {
		return shared.ErrNotFound
	}
	base, err := r.docs.Get(ctx, EntityArticle, baseLocale, slug)
	if err != nil || !base.IsCurrent {
		return shared.ErrNotFound
	}
	alts, err := r.docs.Alternates(ctx, EntityArticle, base.EntityID)
	if err != nil {
		return err
	}
	for _, a := range alts {
		if a.Locale == locale {
			return ErrMoved{Slug: a.Slug}
		}
	}
	return shared.ErrNotFound
}

func (r *PublicRepo) decodeArticle(ctx context.Context, found *pubdocs.Found) (*PublicArticle, error) {
	var d articleSnapshot
	if err := json.Unmarshal(found.Body, &d); err != nil {
		return nil, fmt.Errorf("decode published article: %w", err)
	}
	alts, err := r.docs.Alternates(ctx, EntityArticle, found.EntityID)
	if err != nil {
		return nil, err
	}
	return &PublicArticle{
		Slug: d.Slug, Title: d.Title, Excerpt: d.Excerpt, BodyHTML: d.BodyHTML,
		FeaturedPath: d.FeaturedPath, PublishedAt: d.PublishedAt, SEO: d.SEO,
		Alternates: alts,
	}, nil
}
