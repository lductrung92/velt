package landing

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

// Repository is the data-access contract for landing pages + sections.
type Repository interface {
	ListLandings(ctx context.Context) ([]Page, error)
	GetLanding(ctx context.Context, id uuid.UUID) (*Page, error)
	CreateLanding(ctx context.Context, w landingWrite) (*Page, error)
	UpdateLanding(ctx context.Context, id uuid.UUID, w landingWrite, expectedUpdatedAt time.Time) (*Page, error)
	DeleteLanding(ctx context.Context, id uuid.UUID) error
	LandingSections(ctx context.Context, landingID uuid.UUID) ([]Section, error)
	GetSection(ctx context.Context, sectionID uuid.UUID) (*Section, error)
	CreateSection(ctx context.Context, landingID uuid.UUID, typ string, config []byte, isVisible bool) (*Section, error)
	UpdateSection(ctx context.Context, sectionID uuid.UUID, config []byte, isVisible bool) (*Section, error)
	DeleteSection(ctx context.Context, sectionID uuid.UUID) error
	ReorderSections(ctx context.Context, landingID uuid.UUID, sectionIDs []uuid.UUID) error
	PublishLanding(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error)
	SetLandingPublished(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error)
	UnpublishLanding(ctx context.Context, id uuid.UUID) (*Page, error)
	PublishedPageSlugsUsingLanding(ctx context.Context, landingID uuid.UUID) ([]string, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed landing repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const landingColumns = `id, key, name, status, og_path, seo_title, seo_description, seo_keywords,
	canonical_url, seo_noindex, seo_nofollow, og_title, og_description, published_snapshot, created_at, updated_at`

func scanLanding(row pgx.Row) (*Page, error) {
	var p Page
	err := row.Scan(&p.ID, &p.Key, &p.Name, &p.Status, &p.OGPath, &p.SEOTitle, &p.SEODescription, &p.SEOKeywords,
		&p.CanonicalURL, &p.SEONoindex, &p.SEONofollow, &p.OGTitle, &p.OGDescription, &p.PublishedSnapshot,
		&p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan landing: %w", err)
	}
	return &p, nil
}

func (r *pgxRepository) ListLandings(ctx context.Context) ([]Page, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+landingColumns+` FROM cms_landing_pages ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list landings: %w", err)
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		p, err := scanLanding(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetLanding(ctx context.Context, id uuid.UUID) (*Page, error) {
	return scanLanding(r.pool.QueryRow(ctx, `SELECT `+landingColumns+` FROM cms_landing_pages WHERE id = $1`, id))
}

func (r *pgxRepository) CreateLanding(ctx context.Context, w landingWrite) (*Page, error) {
	p, err := scanLanding(r.pool.QueryRow(ctx, `
		INSERT INTO cms_landing_pages (key, name, og_path, seo_title, seo_description, seo_keywords,
			canonical_url, seo_noindex, seo_nofollow, og_title, og_description)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING `+landingColumns,
		w.Key, w.Name, w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords,
		w.CanonicalURL, w.SEONoindex, w.SEONofollow, w.OGTitle, w.OGDescription))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict // key taken
	}
	return p, err
}

// UpdateLanding is optimistic-locked on updated_at: 0 rows means the row existed
// (the service pre-checks via GetLanding) but its version changed → ErrOptLock.
func (r *pgxRepository) UpdateLanding(ctx context.Context, id uuid.UUID, w landingWrite, expectedUpdatedAt time.Time) (*Page, error) {
	p, err := scanLanding(r.pool.QueryRow(ctx, `
		UPDATE cms_landing_pages SET key=$2, name=$3, og_path=$4, seo_title=$5, seo_description=$6,
			seo_keywords=$7, canonical_url=$8, seo_noindex=$9, seo_nofollow=$10, og_title=$11,
			og_description=$12, updated_at=now()
		 WHERE id = $1 AND updated_at = $13
		RETURNING `+landingColumns,
		id, w.Key, w.Name, w.OGPath, w.SEOTitle, w.SEODescription, w.SEOKeywords,
		w.CanonicalURL, w.SEONoindex, w.SEONofollow, w.OGTitle, w.OGDescription, expectedUpdatedAt))
	if err != nil {
		if shared.IsUniqueViolation(err) {
			return nil, shared.ErrConflict
		}
		if errors.Is(err, shared.ErrNotFound) {
			return nil, shared.ErrOptLock
		}
		return nil, err
	}
	return p, nil
}

func (r *pgxRepository) DeleteLanding(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_landing_pages WHERE id = $1`, id) // sections cascade
	return shared.Wrap("delete landing", err)
}

func (r *pgxRepository) LandingSections(ctx context.Context, landingID uuid.UUID) ([]Section, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, landing_page_id, type, sort_order, is_visible, config
		  FROM cms_landing_sections WHERE landing_page_id = $1 ORDER BY sort_order, id`, landingID)
	if err != nil {
		return nil, fmt.Errorf("landing sections: %w", err)
	}
	defer rows.Close()
	out := []Section{}
	for rows.Next() {
		var s Section
		if err := rows.Scan(&s.ID, &s.LandingPageID, &s.Type, &s.SortOrder, &s.IsVisible, &s.Config); err != nil {
			return nil, fmt.Errorf("scan section: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetSection(ctx context.Context, sectionID uuid.UUID) (*Section, error) {
	var s Section
	err := r.pool.QueryRow(ctx, `
		SELECT id, landing_page_id, type, sort_order, is_visible, config
		  FROM cms_landing_sections WHERE id = $1`, sectionID).
		Scan(&s.ID, &s.LandingPageID, &s.Type, &s.SortOrder, &s.IsVisible, &s.Config)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get section: %w", err)
	}
	return &s, nil
}

// CreateSection appends a section (sort_order = MAX+1) to the landing page.
func (r *pgxRepository) CreateSection(ctx context.Context, landingID uuid.UUID, typ string, config []byte, isVisible bool) (*Section, error) {
	var s Section
	err := r.pool.QueryRow(ctx, `
		INSERT INTO cms_landing_sections (landing_page_id, type, config, is_visible, sort_order)
		VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order)+1, 0) FROM cms_landing_sections WHERE landing_page_id = $1))
		RETURNING id, landing_page_id, type, sort_order, is_visible, config`,
		landingID, typ, config, isVisible).
		Scan(&s.ID, &s.LandingPageID, &s.Type, &s.SortOrder, &s.IsVisible, &s.Config)
	if err != nil {
		if shared.IsForeignKeyViolation(err) {
			return nil, shared.ErrNotFound // landing gone
		}
		return nil, fmt.Errorf("create section: %w", err)
	}
	return &s, nil
}

func (r *pgxRepository) UpdateSection(ctx context.Context, sectionID uuid.UUID, config []byte, isVisible bool) (*Section, error) {
	var s Section
	err := r.pool.QueryRow(ctx, `
		UPDATE cms_landing_sections SET config=$2, is_visible=$3, updated_at=now()
		 WHERE id = $1
		RETURNING id, landing_page_id, type, sort_order, is_visible, config`,
		sectionID, config, isVisible).
		Scan(&s.ID, &s.LandingPageID, &s.Type, &s.SortOrder, &s.IsVisible, &s.Config)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update section: %w", err)
	}
	return &s, nil
}

func (r *pgxRepository) DeleteSection(ctx context.Context, sectionID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_landing_sections WHERE id = $1`, sectionID)
	return shared.Wrap("delete section", err)
}

// ReorderSections sets sort_order = position in sectionIDs, scoped to the landing
// (a section id not belonging to it is ignored by the WHERE clause).
func (r *pgxRepository) ReorderSections(ctx context.Context, landingID uuid.UUID, sectionIDs []uuid.UUID) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		for i, sid := range sectionIDs {
			tag, e := tx.Exec(ctx,
				`UPDATE cms_landing_sections SET sort_order=$3, updated_at=now() WHERE id=$1 AND landing_page_id=$2`,
				sid, landingID, i)
			if e != nil {
				return e
			}
			if tag.RowsAffected() == 0 {
				// Section deleted / moved between the membership pre-check and here
				// (TOCTOU) → roll back the whole reorder.
				return shared.ErrNotFound
			}
		}
		return nil
	})
}

// PublishedPageSlugsUsingLanding returns the slugs of PUBLISHED pages that attach
// this landing — the pages whose public render must be revalidated when the
// landing is (un)published. Reads cms_pages by design (the hosting relation).
func (r *pgxRepository) PublishedPageSlugsUsingLanding(ctx context.Context, landingID uuid.UUID) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT slug FROM cms_pages WHERE landing_id = $1 AND status = 'published'`, landingID)
	if err != nil {
		return nil, fmt.Errorf("pages using landing: %w", err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return nil, err
		}
		out = append(out, slug)
	}
	return out, rows.Err()
}

// PublishLanding freezes the snapshot and flips status→published. Conditional on
// status<>'published' so a concurrent/stale publish yields no row → ErrInvalidStatus.
func (r *pgxRepository) PublishLanding(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	p, err := scanLanding(r.pool.QueryRow(ctx, `
		UPDATE cms_landing_pages SET status='published', published_snapshot=$2, updated_at=now()
		 WHERE id = $1 AND status <> 'published' RETURNING `+landingColumns, id, snapshot))
	if errors.Is(err, shared.ErrNotFound) {
		return nil, shared.ErrInvalidStatus
	}
	return p, err
}

// SetLandingPublished forces the landing to published with the given snapshot
// REGARDLESS of its current status. Used by the page-driven publish: the page
// publish is the action and the landing must always mirror the current sections,
// so an already-published landing still gets its snapshot refreshed (a prior
// best-effort unpublish failure can't strand a stale snapshot). Missing landing →
// ErrNotFound (caller treats a stale landing_id as a no-op).
func (r *pgxRepository) SetLandingPublished(ctx context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	return scanLanding(r.pool.QueryRow(ctx, `
		UPDATE cms_landing_pages SET status='published', published_snapshot=$2, updated_at=now()
		 WHERE id = $1 RETURNING `+landingColumns, id, snapshot))
}

// UnpublishLanding flips published→draft. Conditional on status='published' so a
// stale unpublish yields no row → ErrInvalidStatus.
func (r *pgxRepository) UnpublishLanding(ctx context.Context, id uuid.UUID) (*Page, error) {
	p, err := scanLanding(r.pool.QueryRow(ctx, `
		UPDATE cms_landing_pages SET status='draft', updated_at=now()
		 WHERE id = $1 AND status = 'published' RETURNING `+landingColumns, id))
	if errors.Is(err, shared.ErrNotFound) {
		return nil, shared.ErrInvalidStatus
	}
	return p, err
}
