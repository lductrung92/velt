package taxonomy

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Repository is the data-access contract for categories + tags.
type Repository interface {
	// Categories
	ListCategoriesWithCounts(ctx context.Context) ([]categoryWithCount, error)
	GetCategory(ctx context.Context, id uuid.UUID) (*Category, error)
	CreateCategory(ctx context.Context, w categoryWrite) (*Category, error)
	UpdateCategory(ctx context.Context, id uuid.UUID, w categoryWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Category, error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error
	CategoryHasChildren(ctx context.Context, id uuid.UUID) (bool, error)
	CategoryArticleCount(ctx context.Context, id uuid.UUID) (int, error)
	CategoryCreatesCycle(ctx context.Context, node, newParent uuid.UUID) (bool, error)
	CategorySlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)

	// Tags
	ListTagsWithCounts(ctx context.Context, p TagListParams) ([]tagWithCount, int, error)
	ListTagOptions(ctx context.Context) ([]Tag, error)
	GetTag(ctx context.Context, id uuid.UUID) (*Tag, error)
	TagExists(ctx context.Context, id uuid.UUID) (bool, error)
	TagSlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	TagUsageCount(ctx context.Context, id uuid.UUID) (int, error)
	CreateTag(ctx context.Context, name, slug string) (*Tag, error)
	UpdateTag(ctx context.Context, id uuid.UUID, name, slug string) (*Tag, error)
	DeleteTag(ctx context.Context, id uuid.UUID) error
	MergeTags(ctx context.Context, sourceID, targetID uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed taxonomy repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// categoriesTreeAdvisoryLock serializes concurrent category MOVES inside a
// transaction (TOCTOU guard). Arbitrary constant scoped to the cms_categories tree.
const categoriesTreeAdvisoryLock = 0x636D73_63617467 // "cms_catg"

// categoryCycleQuery reports whether making $1's parent be $2 forms a cycle ($2
// is $1 or a descendant of $1) — walks UP from $2.
const categoryCycleQuery = `
	WITH RECURSIVE up AS (
		SELECT id, parent_id FROM cms_categories WHERE id = $2
		UNION ALL
		SELECT c.id, c.parent_id FROM cms_categories c JOIN up ON c.id = up.parent_id
	)
	SELECT EXISTS (SELECT 1 FROM up WHERE id = $1)`

const categoryColumns = `id, name, slug, parent_id, description, sort_order,
	seo_title, seo_description, seo_keywords, created_at, updated_at`

func scanCategory(row pgx.Row) (*Category, error) {
	var c Category
	err := row.Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID, &c.Description, &c.SortOrder,
		&c.SEOTitle, &c.SEODescription, &c.SEOKeywords, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan category: %w", err)
	}
	return &c, nil
}

func (r *pgxRepository) ListCategoriesWithCounts(ctx context.Context) ([]categoryWithCount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+categoryColumns+`,
		       (SELECT count(*) FROM cms_articles a WHERE a.category_id = c.id) AS article_count
		  FROM cms_categories c
		 ORDER BY c.sort_order, c.name`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()
	out := []categoryWithCount{}
	for rows.Next() {
		var c categoryWithCount
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID, &c.Description, &c.SortOrder,
			&c.SEOTitle, &c.SEODescription, &c.SEOKeywords, &c.CreatedAt, &c.UpdatedAt, &c.ArticleCount); err != nil {
			return nil, fmt.Errorf("scan category row: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetCategory(ctx context.Context, id uuid.UUID) (*Category, error) {
	return scanCategory(r.pool.QueryRow(ctx, `SELECT `+categoryColumns+` FROM cms_categories WHERE id = $1`, id))
}

func (r *pgxRepository) CreateCategory(ctx context.Context, w categoryWrite) (*Category, error) {
	c, err := scanCategory(r.pool.QueryRow(ctx, `
		INSERT INTO cms_categories (name, slug, parent_id, description, sort_order, seo_title, seo_description, seo_keywords)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+categoryColumns,
		w.Name, w.Slug, w.ParentID, w.Description, w.SortOrder, w.SEOTitle, w.SEODescription, w.SEOKeywords))
	if err != nil {
		if shared.IsUniqueViolation(err) {
			return nil, shared.ErrConflict
		}
		if shared.IsForeignKeyViolation(err) { // parent_id points at a now-deleted row
			return nil, shared.ErrParentMissing
		}
	}
	return c, err
}

// UpdateCategory is optimistic-locked (updated_at match → else ErrOptLock). For a
// real move to a non-root parent (recheckCycle) it serializes against other moves
// with an advisory xact lock and re-checks the cycle inside the transaction →
// ErrCategoryCycle (closes the TOCTOU race).
func (r *pgxRepository) UpdateCategory(ctx context.Context, id uuid.UUID, w categoryWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Category, error) {
	var c *Category
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if recheckCycle && w.ParentID != nil {
			if _, e := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(categoriesTreeAdvisoryLock)); e != nil {
				return e
			}
			var cycles bool
			if e := tx.QueryRow(ctx, categoryCycleQuery, id, *w.ParentID).Scan(&cycles); e != nil {
				return e
			}
			if cycles {
				return shared.ErrCategoryCycle
			}
		}
		var e error
		c, e = scanCategory(tx.QueryRow(ctx, `
			UPDATE cms_categories
			   SET name = $3, slug = $4, parent_id = $5, description = $6, sort_order = $7,
			       seo_title = $8, seo_description = $9, seo_keywords = $10, updated_at = now()
			 WHERE id = $1 AND updated_at = $2
			RETURNING `+categoryColumns,
			id, expectedUpdatedAt, w.Name, w.Slug, w.ParentID, w.Description, w.SortOrder, w.SEOTitle, w.SEODescription, w.SEOKeywords))
		if e != nil {
			if shared.IsUniqueViolation(e) {
				return shared.ErrConflict
			}
			if shared.IsForeignKeyViolation(e) {
				return shared.ErrParentMissing
			}
			if errors.Is(e, shared.ErrNotFound) {
				return shared.ErrOptLock // row existed (service pre-checked) → updated_at changed
			}
			return e
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (r *pgxRepository) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	// Conditional delete: refuse while the category still has child categories or
	// articles (cms_articles.category_id is ON DELETE SET NULL — an unconditional
	// delete would silently null an article attached in the pre-check race).
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM cms_categories
		 WHERE id = $1
		   AND NOT EXISTS (SELECT 1 FROM cms_categories ch WHERE ch.parent_id = $1)
		   AND NOT EXISTS (SELECT 1 FROM cms_articles a WHERE a.category_id = $1)`, id)
	if err != nil {
		if shared.IsForeignKeyViolation(err) { // child FK RESTRICT backstop
			return shared.ErrInUse
		}
		return shared.Wrap("delete category", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrInUse
	}
	return nil
}

func (r *pgxRepository) CategoryHasChildren(ctx context.Context, id uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM cms_categories WHERE parent_id = $1)`, id).Scan(&exists)
	return exists, shared.Wrap("category has children", err)
}

func (r *pgxRepository) CategoryArticleCount(ctx context.Context, id uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_articles WHERE category_id = $1`, id).Scan(&n)
	return n, shared.Wrap("category article count", err)
}

// CategoryCreatesCycle reports whether setting node's parent to newParent would
// form a cycle (newParent is node or a descendant of node).
func (r *pgxRepository) CategoryCreatesCycle(ctx context.Context, node, newParent uuid.UUID) (bool, error) {
	var cycles bool
	err := r.pool.QueryRow(ctx, categoryCycleQuery, node, newParent).Scan(&cycles)
	return cycles, shared.Wrap("category cycle check", err)
}

func (r *pgxRepository) CategorySlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM cms_categories WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, shared.Wrap("category slug exists", err)
}

const tagColumns = `id, name, slug, created_at`

func scanTag(row pgx.Row) (*Tag, error) {
	var t Tag
	err := row.Scan(&t.ID, &t.Name, &t.Slug, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan tag: %w", err)
	}
	return &t, nil
}

// tagSortColumns is the closed whitelist of orderable tag columns (no injection).
// "usage" sorts by the computed usage_count alias; ties fall back to name.
var tagSortColumns = map[string]string{
	"name":   "t.name ASC",
	"-name":  "t.name DESC",
	"slug":   "t.slug ASC",
	"-slug":  "t.slug DESC",
	"usage":  "usage_count ASC, t.name ASC",
	"-usage": "usage_count DESC, t.name ASC",
}

func tagOrderBy(sort string) string {
	if col, ok := tagSortColumns[sort]; ok {
		return col
	}
	return "t.name"
}

func (r *pgxRepository) ListTagsWithCounts(ctx context.Context, p TagListParams) ([]tagWithCount, int, error) {
	where := ""
	args := []any{}
	if p.Query != "" {
		args = append(args, p.Query)
		// Plain concatenation (not fmt.Sprintf), so use single % wildcards.
		where = " WHERE (t.name ILIKE '%' || $1 || '%' OR t.slug ILIKE '%' || $1 || '%')"
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_tags t`+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count tags: %w", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	q := `SELECT ` + tagColumns + `,
	             (SELECT count(*) FROM cms_article_tags at WHERE at.tag_id = t.id) AS usage_count
	        FROM cms_tags t` + where + ` ORDER BY ` + tagOrderBy(p.Sort) +
		fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list tags: %w", err)
	}
	defer rows.Close()
	out := []tagWithCount{}
	for rows.Next() {
		var t tagWithCount
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.CreatedAt, &t.UsageCount); err != nil {
			return nil, 0, fmt.Errorf("scan tag row: %w", err)
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}

// ListTagOptions returns every tag (id/name/slug only), ordered by name, for
// selectors that need the full set (merge target, article-list filter).
func (r *pgxRepository) ListTagOptions(ctx context.Context) ([]Tag, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+tagColumns+` FROM cms_tags t ORDER BY t.name`)
	if err != nil {
		return nil, fmt.Errorf("list tag options: %w", err)
	}
	defer rows.Close()
	out := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan tag option: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetTag(ctx context.Context, id uuid.UUID) (*Tag, error) {
	return scanTag(r.pool.QueryRow(ctx, `SELECT `+tagColumns+` FROM cms_tags WHERE id = $1`, id))
}

func (r *pgxRepository) TagExists(ctx context.Context, id uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM cms_tags WHERE id = $1)`, id).Scan(&exists)
	return exists, shared.Wrap("tag exists", err)
}

func (r *pgxRepository) TagSlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM cms_tags WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, shared.Wrap("tag slug exists", err)
}

func (r *pgxRepository) TagUsageCount(ctx context.Context, id uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_article_tags WHERE tag_id = $1`, id).Scan(&n)
	return n, shared.Wrap("tag usage count", err)
}

func (r *pgxRepository) CreateTag(ctx context.Context, name, slug string) (*Tag, error) {
	t, err := scanTag(r.pool.QueryRow(ctx,
		`INSERT INTO cms_tags (name, slug) VALUES ($1, $2) RETURNING `+tagColumns, name, slug))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return t, err
}

func (r *pgxRepository) UpdateTag(ctx context.Context, id uuid.UUID, name, slug string) (*Tag, error) {
	t, err := scanTag(r.pool.QueryRow(ctx,
		`UPDATE cms_tags SET name = $2, slug = $3 WHERE id = $1 RETURNING `+tagColumns, id, name, slug))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return t, err
}

func (r *pgxRepository) DeleteTag(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_tags WHERE id = $1`, id)
	return shared.Wrap("delete tag", err)
}

// MergeTags moves source's article associations onto target (skipping rows that
// would duplicate), then deletes source — whose remaining join rows cascade away.
func (r *pgxRepository) MergeTags(ctx context.Context, sourceID, targetID uuid.UUID) error {
	return shared.Wrap("merge tags", pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO cms_article_tags (article_id, tag_id)
			SELECT article_id, $2 FROM cms_article_tags WHERE tag_id = $1
			ON CONFLICT (article_id, tag_id) DO NOTHING`, sourceID, targetID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM cms_tags WHERE id = $1`, sourceID)
		return err
	}))
}
