package pages

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

// Repository is the data-access contract for static pages.
type Repository interface {
	ListPages(ctx context.Context) ([]Page, error)
	GetPage(ctx context.Context, id uuid.UUID) (*Page, error)
	CreatePage(ctx context.Context, w pageWrite) (*Page, error)
	UpdatePage(ctx context.Context, id uuid.UUID, w pageWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Page, error)
	DeletePage(ctx context.Context, id uuid.UUID) error
	PageHasChildren(ctx context.Context, id uuid.UUID) (bool, error)
	PageCreatesCycle(ctx context.Context, node, newParent uuid.UUID) (bool, error)
	PageSlugExists(ctx context.Context, slug string, parentID *uuid.UUID, excludeID *uuid.UUID) (bool, error)
	PublishPage(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error)
	RefreshPageSnapshot(ctx context.Context, id uuid.UUID, snapshot []byte) error
	UnpublishPage(ctx context.Context, id uuid.UUID) (*Page, error)
	GetPublishedPageBySlug(ctx context.Context, slug string) (*Page, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed page repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// pagesTreeAdvisoryLock serializes concurrent page MOVES inside a transaction
// (TOCTOU guard). Arbitrary constant scoped to the cms_pages tree.
const pagesTreeAdvisoryLock = 0x636D73_70616765 // "cms_page"

// pageCycleQuery reports whether making $1's parent be $2 forms a cycle ($2 is $1
// or a descendant of $1) — walks UP from $2.
const pageCycleQuery = `
	WITH RECURSIVE up AS (
		SELECT id, parent_id FROM cms_pages WHERE id = $2
		UNION ALL
		SELECT p.id, p.parent_id FROM cms_pages p JOIN up ON p.id = up.parent_id
	)
	SELECT EXISTS (SELECT 1 FROM up WHERE id = $1)`

const pageColumns = `id, title, slug, body_html, body_json, parent_id, sort_order,
	template, status, og_path, seo_title, seo_description, seo_keywords,
	canonical_url, seo_noindex, seo_nofollow, og_title, og_description,
	published_at, published_snapshot, created_at, updated_at, landing_id`

func scanPage(row pgx.Row) (*Page, error) {
	var p Page
	err := row.Scan(&p.ID, &p.Title, &p.Slug, &p.BodyHTML, &p.BodyJSON, &p.ParentID, &p.SortOrder,
		&p.Template, &p.Status, &p.OGPath, &p.SEOTitle, &p.SEODescription, &p.SEOKeywords,
		&p.CanonicalURL, &p.SEONoindex, &p.SEONofollow, &p.OGTitle, &p.OGDescription,
		&p.PublishedAt, &p.PublishedSnapshot, &p.CreatedAt, &p.UpdatedAt, &p.LandingID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan page: %w", err)
	}
	return &p, nil
}

func (r *pgxRepository) ListPages(ctx context.Context) ([]Page, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+pageColumns+` FROM cms_pages ORDER BY sort_order, title`)
	if err != nil {
		return nil, fmt.Errorf("list pages: %w", err)
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		p, err := scanPage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetPage(ctx context.Context, id uuid.UUID) (*Page, error) {
	return scanPage(r.pool.QueryRow(ctx, `SELECT `+pageColumns+` FROM cms_pages WHERE id = $1`, id))
}

// GetPublishedPageBySlug returns a published page by slug (public read). Slugs are
// unique per parent; for a flat public lookup we take the first match (root-first).
func (r *pgxRepository) GetPublishedPageBySlug(ctx context.Context, slug string) (*Page, error) {
	return scanPage(r.pool.QueryRow(ctx, `SELECT `+pageColumns+`
		FROM cms_pages WHERE slug = $1 AND status = 'published'
		ORDER BY parent_id NULLS FIRST LIMIT 1`, slug))
}

func (r *pgxRepository) CreatePage(ctx context.Context, w pageWrite) (*Page, error) {
	p, err := scanPage(r.pool.QueryRow(ctx, `
		INSERT INTO cms_pages (title, slug, body_html, body_json, parent_id, sort_order, template,
			og_path, seo_title, seo_description, seo_keywords, canonical_url, seo_noindex, seo_nofollow,
			og_title, og_description, landing_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		RETURNING `+pageColumns,
		w.Title, w.Slug, w.BodyHTML, w.BodyJSON, w.ParentID, w.SortOrder, w.Template,
		w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords, w.CanonicalURL, w.SEONoindex, w.SEONofollow,
		w.OGTitle, w.OGDescription, w.LandingID))
	if err != nil {
		if shared.IsUniqueViolation(err) {
			return nil, shared.ErrConflict
		}
		if shared.FKConstraintContains(err, "landing") {
			return nil, shared.ErrLandingMissing
		}
		if shared.IsForeignKeyViolation(err) {
			return nil, shared.ErrParentMissing
		}
	}
	return p, err
}

// UpdatePage applies a full-row PATCH guarded by optimistic lock (updated_at must
// match → else ErrOptLock). When recheckCycle is set (a move to a non-root
// parent), it serializes against other moves with an advisory xact lock and
// re-checks the cycle inside the transaction → ErrPageCycle.
func (r *pgxRepository) UpdatePage(ctx context.Context, id uuid.UUID, w pageWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Page, error) {
	var p *Page
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if recheckCycle && w.ParentID != nil {
			if _, e := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(pagesTreeAdvisoryLock)); e != nil {
				return e
			}
			var cycles bool
			if e := tx.QueryRow(ctx, pageCycleQuery, id, *w.ParentID).Scan(&cycles); e != nil {
				return e
			}
			if cycles {
				return shared.ErrPageCycle
			}
		}
		var e error
		p, e = scanPage(tx.QueryRow(ctx, `
			UPDATE cms_pages SET title=$3, slug=$4, body_html=$5, body_json=$6, parent_id=$7, sort_order=$8,
				template=$9, og_path=$10, seo_title=$11, seo_description=$12, seo_keywords=$13, canonical_url=$14,
				seo_noindex=$15, seo_nofollow=$16, og_title=$17, og_description=$18, landing_id=$19, updated_at=now()
			 WHERE id = $1 AND updated_at = $2
			RETURNING `+pageColumns,
			id, expectedUpdatedAt, w.Title, w.Slug, w.BodyHTML, w.BodyJSON, w.ParentID, w.SortOrder, w.Template,
			w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords, w.CanonicalURL, w.SEONoindex, w.SEONofollow,
			w.OGTitle, w.OGDescription, w.LandingID))
		if e != nil {
			if shared.IsUniqueViolation(e) {
				return shared.ErrConflict
			}
			if shared.FKConstraintContains(e, "landing") {
				return shared.ErrLandingMissing
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
	return p, nil
}

func (r *pgxRepository) DeletePage(ctx context.Context, id uuid.UUID) error {
	// Conditional on no child pages (parent_id FK is RESTRICT). 0 rows ⇒ has a child
	// (or concurrent delete) → ErrInUse (service → 409 page_has_children).
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM cms_pages
		 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM cms_pages ch WHERE ch.parent_id = $1)`, id)
	if err != nil {
		if shared.IsForeignKeyViolation(err) {
			return shared.ErrInUse
		}
		return shared.Wrap("delete page", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrInUse
	}
	return nil
}

func (r *pgxRepository) PageHasChildren(ctx context.Context, id uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM cms_pages WHERE parent_id = $1)`, id).Scan(&exists)
	return exists, shared.Wrap("page has children", err)
}

// PageCreatesCycle reports whether setting node's parent to newParent would form
// a cycle (newParent is node or a descendant of node).
func (r *pgxRepository) PageCreatesCycle(ctx context.Context, node, newParent uuid.UUID) (bool, error) {
	var cycles bool
	err := r.pool.QueryRow(ctx, pageCycleQuery, node, newParent).Scan(&cycles)
	return cycles, shared.Wrap("page cycle check", err)
}

func (r *pgxRepository) PageSlugExists(ctx context.Context, slug string, parentID *uuid.UUID, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM cms_pages
			 WHERE slug = $1
			   AND parent_id IS NOT DISTINCT FROM $2
			   AND ($3::uuid IS NULL OR id <> $3))`,
		slug, parentID, excludeID).Scan(&exists)
	return exists, shared.Wrap("page slug exists", err)
}

// PublishPage freezes the snapshot and flips status→published. Conditional on
// status<>'published' so a concurrent publish yields no row → ErrInvalidStatus.
func (r *pgxRepository) PublishPage(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	p, err := scanPage(r.pool.QueryRow(ctx, `
		UPDATE cms_pages SET status='published', published_at=now(), published_snapshot=$2, updated_at=now()
		 WHERE id = $1 AND status <> 'published'
		RETURNING `+pageColumns, id, snapshot))
	if errors.Is(err, shared.ErrNotFound) {
		return nil, shared.ErrInvalidStatus
	}
	return p, err
}

// RefreshPageSnapshot re-freezes an ALREADY-published page's snapshot in place
// (Save = live): status + published_at are left unchanged. A no-op for a page
// that isn't published (nothing public to refresh).
func (r *pgxRepository) RefreshPageSnapshot(ctx context.Context, id uuid.UUID, snapshot []byte) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE cms_pages SET published_snapshot=$2, updated_at=now()
		  WHERE id = $1 AND status = 'published'`, id, snapshot)
	if err != nil {
		return fmt.Errorf("refresh page snapshot: %w", err)
	}
	return nil
}

// UnpublishPage flips published→archived. Conditional on status='published' so a
// stale unpublish yields no row → ErrInvalidStatus.
func (r *pgxRepository) UnpublishPage(ctx context.Context, id uuid.UUID) (*Page, error) {
	p, err := scanPage(r.pool.QueryRow(ctx, `
		UPDATE cms_pages SET status='archived', updated_at=now()
		 WHERE id = $1 AND status = 'published'
		RETURNING `+pageColumns, id))
	if errors.Is(err, shared.ErrNotFound) {
		return nil, shared.ErrInvalidStatus
	}
	return p, err
}
