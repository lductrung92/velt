package articles

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
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
}

// PublicRepo reads published articles for public consumption (no auth) — a
// separate seam from the admin Repository so widget resolvers can fetch fresh
// cards without touching the editorial surface.
type PublicRepo struct{ pool *pgxpool.Pool }

// NewPublicRepository builds the public-read article repo.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepo { return &PublicRepo{pool: pool} }

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
	q := `SELECT a.slug, a.title, a.excerpt, a.published_at
	        FROM cms_articles a
	       WHERE ` + strings.Join(conds, " AND ") +
		` ORDER BY a.published_at DESC NULLS LAST ` + fmt.Sprintf(`LIMIT $%d`, len(args))

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
	Query  string
	Sort   string // newest | oldest | title (caller pre-validates)
	Limit  int
	Offset int
}

// PublicArticle is one published article for the public detail (blog post) page.
type PublicArticle struct {
	Slug           string
	Title          string
	Excerpt        *string
	BodyHTML       *string
	FeaturedPath   *string
	PublishedAt    *time.Time
	SEOTitle       *string
	SEODescription *string
	CanonicalURL   *string
	OGTitle        *string
	OGDescription  *string
}

// publicSortSQL maps a (pre-validated) sort key to an ORDER BY clause.
func publicSortSQL(sort string) string {
	switch sort {
	case "oldest":
		return "a.published_at ASC NULLS LAST, a.title ASC"
	case "title":
		return "a.title ASC"
	default: // newest
		return "a.published_at DESC NULLS LAST, a.title ASC"
	}
}

// ListPublishedPage returns one page of published articles (with total match
// count) for the blog, optionally narrowed by a free-text query over the title
// and excerpt.
func (r *PublicRepo) ListPublishedPage(ctx context.Context, f PublicListFilter) ([]PublicCard, int, error) {
	conds := []string{"a.status = 'published'"}
	args := []any{}
	if q := strings.TrimSpace(f.Query); q != "" {
		args = append(args, "%"+q+"%")
		conds = append(conds, fmt.Sprintf("(a.title ILIKE $%d OR a.excerpt ILIKE $%d)", len(args), len(args)))
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_articles a WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count published articles: %w", err)
	}
	if total == 0 {
		return []PublicCard{}, 0, nil
	}

	args = append(args, f.Limit, f.Offset)
	query := `SELECT a.slug, a.title, a.excerpt, a.published_at, a.featured_path
	            FROM cms_articles a
	           WHERE ` + where +
		` ORDER BY ` + publicSortSQL(f.Sort) +
		fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list published articles page: %w", err)
	}
	defer rows.Close()
	out := []PublicCard{}
	for rows.Next() {
		var c PublicCard
		if err := rows.Scan(&c.Slug, &c.Title, &c.Excerpt, &c.PublishedAt, &c.FeaturedPath); err != nil {
			return nil, 0, fmt.Errorf("scan published article card: %w", err)
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// GetPublishedBySlug returns one published article by slug, or shared.ErrNotFound.
func (r *PublicRepo) GetPublishedBySlug(ctx context.Context, slug string) (*PublicArticle, error) {
	var a PublicArticle
	err := r.pool.QueryRow(ctx,
		`SELECT a.slug, a.title, a.excerpt, a.body_html, a.featured_path, a.published_at,
		        a.seo_title, a.seo_description, a.canonical_url, a.og_title, a.og_description
		   FROM cms_articles a
		  WHERE a.slug = $1 AND a.status = 'published'`, slug).
		Scan(&a.Slug, &a.Title, &a.Excerpt, &a.BodyHTML, &a.FeaturedPath, &a.PublishedAt,
			&a.SEOTitle, &a.SEODescription, &a.CanonicalURL, &a.OGTitle, &a.OGDescription)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get published article: %w", err)
	}
	return &a, nil
}
