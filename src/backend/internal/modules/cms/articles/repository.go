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

// articleStatusWrite carries the status transition applied on create/update.
// Snapshot is non-nil only when entering published; PublishAt for scheduled;
// ReviewNote for needs_revision.
type articleStatusWrite struct {
	Status     string
	PublishAt  *time.Time
	Snapshot   []byte
	ReviewNote *string
}

// Repository is the data-access contract for articles. Category/tag references
// are resolved into article-owned DTOs (no taxonomy type import).
type Repository interface {
	ListArticles(ctx context.Context, p ArticleListParams) ([]articleListRow, int, error)
	GetArticle(ctx context.Context, id uuid.UUID) (*Article, error)
	ArticleSlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	ResolveArticleRefs(ctx context.Context, authorID uuid.UUID, categoryID *uuid.UUID) (ArticleAuthor, *ArticleCategoryRef, error)
	ArticleTags(ctx context.Context, id uuid.UUID) ([]ArticleTagRef, error)
	CountTags(ctx context.Context, ids []uuid.UUID) (int, error)
	CategoryExists(ctx context.Context, id uuid.UUID) (bool, error)
	CreateArticle(ctx context.Context, w articleWrite, authorID uuid.UUID, authorRole string, sw articleStatusWrite, tagIDs []uuid.UUID) (*Article, error)
	UpdateArticle(ctx context.Context, id uuid.UUID, w articleWrite, sw articleStatusWrite, expectedUpdatedAt time.Time, tagIDs *[]uuid.UUID) (*Article, error)
	DeleteArticle(ctx context.Context, id uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed article repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const articleColumns = `id, title, slug, excerpt, body_html, body_json, category_id,
	author_id, author_role, status, review_note, featured_path, og_path, seo_title, seo_description,
	seo_keywords, canonical_url, seo_noindex, seo_nofollow, og_title, og_description, published_at,
	published_snapshot, created_at, updated_at`

func scanArticle(row pgx.Row) (*Article, error) {
	var a Article
	err := row.Scan(&a.ID, &a.Title, &a.Slug, &a.Excerpt, &a.BodyHTML, &a.BodyJSON, &a.CategoryID,
		&a.AuthorID, &a.AuthorRole, &a.Status, &a.ReviewNote, &a.FeaturedPath, &a.OGPath, &a.SEOTitle, &a.SEODescription,
		&a.SEOKeywords, &a.CanonicalURL, &a.SEONoindex, &a.SEONofollow, &a.OGTitle, &a.OGDescription, &a.PublishedAt,
		&a.PublishedSnapshot, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan article: %w", err)
	}
	return &a, nil
}

func articleSortClause(sort string) string {
	// a.id is appended as a unique tiebreaker so rows with equal sort values keep a
	// stable order across LIMIT/OFFSET pages (no skip/repeat on equal timestamps).
	switch sort {
	case "title":
		return "a.title ASC, a.id ASC"
	case "-title":
		return "a.title DESC, a.id DESC"
	case "created_at":
		return "a.created_at ASC, a.id ASC"
	case "-created_at":
		return "a.created_at DESC, a.id DESC"
	case "published_at":
		return "a.published_at ASC NULLS FIRST, a.id ASC"
	case "-published_at":
		return "a.published_at DESC NULLS LAST, a.id DESC"
	case "updated_at":
		return "a.updated_at ASC, a.id ASC"
	default:
		return "a.updated_at DESC, a.id DESC"
	}
}

func (r *pgxRepository) ListArticles(ctx context.Context, p ArticleListParams) ([]articleListRow, int, error) {
	conds := []string{"1=1"}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}
	if p.Query != "" {
		add("a.title ILIKE '%%' || $%d || '%%'", p.Query)
	}
	if p.Status != "" {
		add("a.status = $%d", p.Status)
	}
	if p.CategoryID != nil {
		add("a.category_id = $%d", *p.CategoryID)
	}
	if p.AuthorID != nil {
		add("a.author_id = $%d", *p.AuthorID)
	}
	if p.Tag != "" {
		add("EXISTS (SELECT 1 FROM cms_article_tags xt JOIN cms_tags t ON t.id = xt.tag_id WHERE xt.article_id = a.id AND t.slug = $%d)", p.Tag)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_articles a WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count articles: %w", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	q := `SELECT a.id, a.title, a.slug, a.status, a.category_id, c.name, c.slug, a.author_id, u.full_name, a.published_at, a.updated_at
	        FROM cms_articles a
	        LEFT JOIN cms_categories c ON c.id = a.category_id
	        JOIN users u ON u.id = a.author_id
	       WHERE ` + where + ` ORDER BY ` + articleSortClause(p.Sort) +
		fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list articles: %w", err)
	}
	defer rows.Close()
	out := []articleListRow{}
	for rows.Next() {
		var x articleListRow
		if err := rows.Scan(&x.ID, &x.Title, &x.Slug, &x.Status, &x.CategoryID, &x.CategoryName, &x.CategorySlug,
			&x.AuthorID, &x.AuthorName, &x.PublishedAt, &x.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan article row: %w", err)
		}
		out = append(out, x)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) GetArticle(ctx context.Context, id uuid.UUID) (*Article, error) {
	return scanArticle(r.pool.QueryRow(ctx, `SELECT `+articleColumns+` FROM cms_articles WHERE id = $1`, id))
}

func (r *pgxRepository) ArticleSlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM cms_articles WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, shared.Wrap("article slug exists", err)
}

// CategoryExists reports whether a category row exists (article category-ref check).
func (r *pgxRepository) CategoryExists(ctx context.Context, id uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM cms_categories WHERE id = $1)`, id).Scan(&exists)
	return exists, shared.Wrap("category exists", err)
}

// ResolveArticleRefs loads the author display name and (when set) the category
// ref for a detail response. A missing author/category leaves the name blank.
func (r *pgxRepository) ResolveArticleRefs(ctx context.Context, authorID uuid.UUID, categoryID *uuid.UUID) (ArticleAuthor, *ArticleCategoryRef, error) {
	author := ArticleAuthor{ID: authorID}
	if err := r.pool.QueryRow(ctx, `SELECT full_name FROM users WHERE id = $1`, authorID).Scan(&author.Name); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return ArticleAuthor{}, nil, fmt.Errorf("resolve author: %w", err)
	}
	if categoryID == nil {
		return author, nil, nil
	}
	cat := ArticleCategoryRef{ID: *categoryID}
	if err := r.pool.QueryRow(ctx, `SELECT name, slug FROM cms_categories WHERE id = $1`, *categoryID).Scan(&cat.Name, &cat.Slug); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return ArticleAuthor{}, nil, fmt.Errorf("resolve category: %w", err)
	}
	return author, &cat, nil
}

func (r *pgxRepository) ArticleTags(ctx context.Context, id uuid.UUID) ([]ArticleTagRef, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT t.id, t.name, t.slug FROM cms_article_tags xt
		  JOIN cms_tags t ON t.id = xt.tag_id
		 WHERE xt.article_id = $1 ORDER BY t.name`, id)
	if err != nil {
		return nil, fmt.Errorf("article tags: %w", err)
	}
	defer rows.Close()
	out := []ArticleTagRef{}
	for rows.Next() {
		var t ArticleTagRef
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug); err != nil {
			return nil, fmt.Errorf("scan article tag: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *pgxRepository) CountTags(ctx context.Context, ids []uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_tags WHERE id = ANY($1)`, ids).Scan(&n)
	return n, shared.Wrap("count tags", err)
}

func insertArticleTags(ctx context.Context, tx pgx.Tx, articleID uuid.UUID, tagIDs []uuid.UUID) error {
	if len(tagIDs) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO cms_article_tags (article_id, tag_id)
		SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, articleID, tagIDs)
	return err
}

// CreateArticle inserts an article at the given target status. published_at +
// published_snapshot are set by status (CASE).
func (r *pgxRepository) CreateArticle(ctx context.Context, w articleWrite, authorID uuid.UUID, authorRole string, sw articleStatusWrite, tagIDs []uuid.UUID) (*Article, error) {
	var a *Article
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var e error
		a, e = scanArticle(tx.QueryRow(ctx, `
			INSERT INTO cms_articles (title, slug, excerpt, body_html, body_json, category_id, author_id, author_role,
				status, review_note, featured_path, og_path, seo_title, seo_description, seo_keywords, canonical_url,
				seo_noindex, seo_nofollow, og_title, og_description, published_at, published_snapshot)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
				CASE WHEN $9 = 'needs_revision' THEN $10 ELSE NULL END,
				$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
				CASE WHEN $9 = 'scheduled' THEN $21::timestamptz WHEN $9 = 'published' THEN now() ELSE NULL END,
				CASE WHEN $9 = 'published' THEN $22::jsonb ELSE NULL END)
			RETURNING `+articleColumns,
			w.Title, w.Slug, w.Excerpt, w.BodyHTML, w.BodyJSON, w.CategoryID, authorID, authorRole,
			sw.Status, sw.ReviewNote, w.FeaturedPath, w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords, w.CanonicalURL,
			w.SEONoindex, w.SEONofollow, w.OGTitle, w.OGDescription, sw.PublishAt, sw.Snapshot))
		if e != nil {
			if shared.IsUniqueViolation(e) {
				return shared.ErrConflict
			}
			return e
		}
		return insertArticleTags(ctx, tx, a.ID, tagIDs)
	})
	if err != nil {
		return nil, err
	}
	return a, nil
}

// UpdateArticle applies content + status transition under optimistic lock.
func (r *pgxRepository) UpdateArticle(ctx context.Context, id uuid.UUID, w articleWrite, sw articleStatusWrite, expectedUpdatedAt time.Time, tagIDs *[]uuid.UUID) (*Article, error) {
	var a *Article
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var e error
		a, e = scanArticle(tx.QueryRow(ctx, `
			UPDATE cms_articles SET title=$3, slug=$4, excerpt=$5, body_html=$6, body_json=$7, category_id=$8,
				status=$9, review_note = CASE WHEN $9 = 'needs_revision' THEN $10 ELSE NULL END,
				featured_path=$11, og_path=$12, seo_title=$13, seo_description=$14, seo_keywords=$15, canonical_url=$16,
				seo_noindex=$17, seo_nofollow=$18, og_title=$19, og_description=$20,
				published_at = CASE WHEN $9 = 'scheduled' THEN $21::timestamptz
			                    WHEN $9 = 'published' AND status <> 'published' THEN now()
			                    ELSE published_at END,
				published_snapshot = CASE WHEN $9 = 'published' THEN $22::jsonb ELSE published_snapshot END,
				updated_at = now()
			 WHERE id = $1 AND updated_at = $2
			RETURNING `+articleColumns,
			id, expectedUpdatedAt, w.Title, w.Slug, w.Excerpt, w.BodyHTML, w.BodyJSON, w.CategoryID,
			sw.Status, sw.ReviewNote, w.FeaturedPath, w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords, w.CanonicalURL,
			w.SEONoindex, w.SEONofollow, w.OGTitle, w.OGDescription, sw.PublishAt, sw.Snapshot))
		if e != nil {
			if shared.IsUniqueViolation(e) {
				return shared.ErrConflict
			}
			if errors.Is(e, shared.ErrNotFound) {
				return shared.ErrOptLock // row exists (service pre-checked) → updated_at changed
			}
			return e
		}
		if tagIDs != nil {
			if _, e := tx.Exec(ctx, `DELETE FROM cms_article_tags WHERE article_id = $1`, id); e != nil {
				return e
			}
			return insertArticleTags(ctx, tx, id, *tagIDs)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *pgxRepository) DeleteArticle(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_articles WHERE id = $1`, id) // article_tags cascade
	return shared.Wrap("delete article", err)
}
