package pages

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

// Repository is the data-access contract for static pages.
type Repository interface {
	ListPages(ctx context.Context, p PageListParams) ([]Page, int, error)
	ListPageOptions(ctx context.Context) ([]PageOption, error)
	GetPage(ctx context.Context, id uuid.UUID) (*Page, error)
	CreatePage(ctx context.Context, w pageWrite) (*Page, error)
	UpdatePage(ctx context.Context, id uuid.UUID, w pageWrite, expectedUpdatedAt time.Time) (*Page, error)
	DeletePage(ctx context.Context, id uuid.UUID) error
	PageSlugExists(ctx context.Context, slug string, parentID *uuid.UUID, excludeID *uuid.UUID) (bool, error)
	PublishPage(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error)
	RefreshPageSnapshot(ctx context.Context, id uuid.UUID, snapshot []byte) error
	UnpublishPage(ctx context.Context, id uuid.UUID) (*Page, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed page repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// pageColumns is every column a Page carries. parent_id is still read and
// written: the column stays, nothing sets it any more, and a row that carries
// one from before keeps it.
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

func (r *pgxRepository) ListPages(ctx context.Context, p PageListParams) ([]Page, int, error) {
	conds := []string{"1=1"}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}
	if q := strings.TrimSpace(p.Query); q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		conds = append(conds, fmt.Sprintf("(lower(title) LIKE $%d OR lower(slug) LIKE $%d)", len(args), len(args)))
	}
	if p.Status != "" {
		add("status = $%d", p.Status)
	}
	if p.LandingOnly {
		conds = append(conds, "landing_id IS NOT NULL")
	}
	// CreatedTo is already midnight after the requested day, so < keeps that
	// whole day in range; see httpx.QueryDateRange.
	if p.CreatedFrom != nil {
		add("created_at >= $%d", *p.CreatedFrom)
	}
	if p.CreatedTo != nil {
		add("created_at < $%d", *p.CreatedTo)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_pages WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pages: %w", err)
	}
	// id breaks the tie: sort_order and title can both repeat, and a page that
	// moves between pages of the result as you walk it is worse than any order.
	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx, `SELECT `+pageColumns+` FROM cms_pages WHERE `+where+
		fmt.Sprintf(` ORDER BY sort_order, title, id LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list pages: %w", err)
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		p, err := scanPage(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *p)
	}
	return out, total, rows.Err()
}

// ListPageOptions reads every page a selector may offer. Capped rather than
// paginated: a picker that silently stopped at page one would quietly hide
// pages somebody is looking for.
func (r *pgxRepository) ListPageOptions(ctx context.Context) ([]PageOption, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, title, slug, status FROM cms_pages ORDER BY title, id LIMIT 500`)
	if err != nil {
		return nil, fmt.Errorf("list page options: %w", err)
	}
	defer rows.Close()
	out := []PageOption{}
	for rows.Next() {
		var o PageOption
		if err := rows.Scan(&o.ID, &o.Title, &o.Slug, &o.Status); err != nil {
			return nil, fmt.Errorf("scan page option: %w", err)
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetPage(ctx context.Context, id uuid.UUID) (*Page, error) {
	return scanPage(r.pool.QueryRow(ctx, `SELECT `+pageColumns+` FROM cms_pages WHERE id = $1`, id))
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
func (r *pgxRepository) UpdatePage(ctx context.Context, id uuid.UUID, w pageWrite, expectedUpdatedAt time.Time) (*Page, error) {
	var p *Page
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		// parent_id is written back exactly as it was read: nothing can set it
		// any more, and a row that carries one from before keeps it.
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
	// A row that still points at this one is a leftover of the hierarchy this
	// module used to have. Refusing the delete would strand the page: nothing
	// can re-parent it any more. So the pointer is cleared — the pages it names
	// are ordinary pages, which is what they already were to a reader — and the
	// delete goes ahead. The FK is RESTRICT, so both must happen together.
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`UPDATE cms_pages SET parent_id = NULL, updated_at = now() WHERE parent_id = $1`, id); err != nil {
			return shared.Wrap("detach child pages", err)
		}
		tag, err := tx.Exec(ctx, `DELETE FROM cms_pages WHERE id = $1`, id)
		if err != nil {
			if shared.IsForeignKeyViolation(err) {
				return shared.ErrInUse
			}
			return shared.Wrap("delete page", err)
		}
		if tag.RowsAffected() == 0 {
			return shared.ErrNotFound
		}
		return nil
	})
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
