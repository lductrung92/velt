package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/shared"
)

// Repository is the product persistence port. The service depends on this
// interface so it can be unit-tested against a fake.
type Repository interface {
	List(ctx context.Context, p ListParams) ([]Product, int, error)
	Get(ctx context.Context, id uuid.UUID) (*Product, error)
	GetBySlug(ctx context.Context, slug string) (*Product, error)
	Create(ctx context.Context, w write, createdBy *uuid.UUID) (*Product, error)
	Update(ctx context.Context, id uuid.UUID, w write) (*Product, error)
	Delete(ctx context.Context, id uuid.UUID) error
	SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	// SetStatus moves the publication axis and, for a publish, stores the frozen
	// snapshot and stamps published_at when it is still empty.
	SetStatus(ctx context.Context, id uuid.UUID, status string, snapshot json.RawMessage, stampPublishedAt bool) (*Product, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed product repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const productColumns = `id, slug, name, summary, body_html, body_json, cover_path,
	status, lifecycle, version, released_at,
	audience, platforms, tech_stack, highlights,
	is_featured, sort_order,
	product_url, demo_url, demo_access, demo_instructions,
	seo_title, seo_description, seo_keywords, canonical_url, seo_noindex, seo_nofollow,
	og_title, og_description, og_path,
	published_at, published_snapshot, created_by, created_at, updated_at`

func scanProduct(row pgx.Row) (*Product, error) {
	var p Product
	var audience, platforms, tech, highlights, demoSteps []byte
	err := row.Scan(
		&p.ID, &p.Slug, &p.Name, &p.Summary, &p.BodyHTML, &p.BodyJSON, &p.CoverPath,
		&p.Status, &p.Lifecycle, &p.Version, &p.ReleasedAt,
		&audience, &platforms, &tech, &highlights,
		&p.IsFeatured, &p.SortOrder,
		&p.ProductURL, &p.DemoURL, &p.DemoAccess, &demoSteps,
		&p.SEO.Title, &p.SEO.Description, &p.SEO.Keywords, &p.SEO.Canonical,
		&p.SEO.NoIndex, &p.SEO.NoFollow,
		&p.SEO.OGTitle, &p.SEO.OGDesc, &p.SEO.OGPath,
		&p.PublishedAt, &p.PublishedSnapshot, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan product: %w", err)
	}
	for _, d := range []struct {
		raw  []byte
		dst  *[]string
		name string
	}{
		{audience, &p.Audience, "audience"},
		{platforms, &p.Platforms, "platforms"},
		{tech, &p.TechStack, "tech_stack"},
		{highlights, &p.Highlights, "highlights"},
		{demoSteps, &p.DemoInstructions, "demo_instructions"},
	} {
		// Every column is NOT NULL DEFAULT '[]', so a decode failure means corrupt
		// data rather than an absent value — surface it instead of emptying it.
		if err := json.Unmarshal(d.raw, d.dst); err != nil {
			return nil, fmt.Errorf("decode product %s: %w", d.name, err)
		}
		if *d.dst == nil {
			*d.dst = []string{}
		}
	}
	return &p, nil
}

// sortColumns is the closed whitelist of orderable columns (no injection). The
// default mirrors the public listing: featured first, then the curated order.
var sortColumns = map[string]string{
	"name":         "p.name ASC",
	"-name":        "p.name DESC",
	"updated_at":   "p.updated_at ASC",
	"-updated_at":  "p.updated_at DESC",
	"released_at":  "p.released_at ASC NULLS LAST",
	"-released_at": "p.released_at DESC NULLS LAST",
	"sort_order":   "p.sort_order ASC, p.name ASC",
}

func orderBy(sort string) string {
	if col, ok := sortColumns[sort]; ok {
		return col
	}
	return "p.is_featured DESC, p.sort_order ASC, p.name ASC"
}

func (r *pgxRepository) List(ctx context.Context, p ListParams) ([]Product, int, error) {
	var where []string
	var args []any
	add := func(clause string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if p.Query != "" {
		add("(lower(p.name) LIKE $%d OR lower(p.slug) LIKE $%[1]d OR lower(coalesce(p.summary,'')) LIKE $%[1]d)",
			"%"+strings.ToLower(p.Query)+"%")
	}
	if p.Status != "" {
		add("p.status = $%d", p.Status)
	}
	if p.Lifecycle != "" {
		add("p.lifecycle = $%d", p.Lifecycle)
	}
	// Build the containment operand with the JSON encoder rather than string
	// concatenation: a quote or backslash in the filter would otherwise produce
	// malformed JSON and fail the ::jsonb cast with a 500.
	if p.Platform != "" {
		add("p.platforms @> $%d::jsonb", jsonArray(p.Platform))
	}
	if p.Audience != "" {
		add("p.audience @> $%d::jsonb", jsonArray(p.Audience))
	}
	if p.Featured != nil {
		add("p.is_featured = $%d", *p.Featured)
	}
	clause := ""
	if len(where) > 0 {
		clause = " WHERE " + strings.Join(where, " AND ")
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM products p`+clause, args...).Scan(&total); err != nil {
		return nil, 0, shared.Wrap("count products", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	q := fmt.Sprintf(`SELECT %s FROM products p%s ORDER BY %s LIMIT $%d OFFSET $%d`,
		productColumns, clause, orderBy(p.Sort), len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, shared.Wrap("list products", err)
	}
	defer rows.Close()

	items := make([]Product, 0, p.PageSize)
	for rows.Next() {
		prod, err := scanProduct(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *prod)
	}
	return items, total, shared.Wrap("list products", rows.Err())
}

func (r *pgxRepository) Get(ctx context.Context, id uuid.UUID) (*Product, error) {
	return scanProduct(r.pool.QueryRow(ctx,
		`SELECT `+productColumns+` FROM products p WHERE p.id = $1`, id))
}

func (r *pgxRepository) GetBySlug(ctx context.Context, slug string) (*Product, error) {
	return scanProduct(r.pool.QueryRow(ctx,
		`SELECT `+productColumns+` FROM products p WHERE p.slug = $1`, slug))
}

// writeArgs flattens a write into the positional arguments shared by INSERT and
// UPDATE, so the two statements can never drift in column order.
func writeArgs(w write) ([]any, error) {
	lists := make([][]byte, 0, 5)
	for _, v := range [][]string{w.Audience, w.Platforms, w.TechStack, w.Highlights, w.DemoInstructions} {
		if v == nil {
			v = []string{}
		}
		b, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("encode product list: %w", err)
		}
		lists = append(lists, b)
	}
	body := w.BodyJSON
	if len(body) == 0 {
		body = nil // NULL, not the JSON literal "null"
	}
	return []any{
		w.Slug, w.Name, w.Summary, w.BodyHTML, body, w.CoverPath,
		w.Lifecycle, w.Version, w.ReleasedAt,
		lists[0], lists[1], lists[2], lists[3],
		w.IsFeatured, w.SortOrder,
		w.ProductURL, w.DemoURL, w.DemoAccess, lists[4],
		w.SEO.Title, w.SEO.Description, w.SEO.Keywords, w.SEO.Canonical,
		w.SEO.NoIndex, w.SEO.NoFollow, w.SEO.OGTitle, w.SEO.OGDesc, w.SEO.OGPath,
	}, nil
}

func (r *pgxRepository) Create(ctx context.Context, w write, createdBy *uuid.UUID) (*Product, error) {
	args, err := writeArgs(w)
	if err != nil {
		return nil, err
	}
	args = append(args, createdBy)
	p, err := scanProduct(r.pool.QueryRow(ctx,
		`INSERT INTO products (
			slug, name, summary, body_html, body_json, cover_path,
			lifecycle, version, released_at,
			audience, platforms, tech_stack, highlights,
			is_featured, sort_order,
			product_url, demo_url, demo_access, demo_instructions,
			seo_title, seo_description, seo_keywords, canonical_url,
			seo_noindex, seo_nofollow, og_title, og_description, og_path,
			created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9,
			$10, $11, $12, $13,
			$14, COALESCE($15, (SELECT COALESCE(max(sort_order), -1) + 1 FROM products)),
			$16, $17, $18, $19,
			$20, $21, $22, $23,
			$24, $25, $26, $27, $28,
			$29
		) RETURNING `+productColumns, args...))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return p, err
}

func (r *pgxRepository) Update(ctx context.Context, id uuid.UUID, w write) (*Product, error) {
	args, err := writeArgs(w)
	if err != nil {
		return nil, err
	}
	args = append(args, id)
	p, err := scanProduct(r.pool.QueryRow(ctx,
		`UPDATE products SET
			slug = $1, name = $2, summary = $3, body_html = $4, body_json = $5, cover_path = $6,
			lifecycle = $7, version = $8, released_at = $9,
			audience = $10, platforms = $11, tech_stack = $12, highlights = $13,
			is_featured = $14, sort_order = $15,
			product_url = $16, demo_url = $17, demo_access = $18, demo_instructions = $19,
			seo_title = $20, seo_description = $21, seo_keywords = $22, canonical_url = $23,
			seo_noindex = $24, seo_nofollow = $25, og_title = $26, og_description = $27, og_path = $28,
			updated_at = now()
		WHERE id = $29 RETURNING `+productColumns, args...))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return p, err
}

func (r *pgxRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM products WHERE id = $1`, id)
	if err != nil {
		return shared.Wrap("delete product", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}

func (r *pgxRepository) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM products WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, shared.Wrap("product slug exists", err)
}

func (r *pgxRepository) SetStatus(ctx context.Context, id uuid.UUID, status string, snapshot json.RawMessage, stampPublishedAt bool) (*Product, error) {
	var stamp *time.Time
	if stampPublishedAt {
		now := time.Now()
		stamp = &now
	}
	// COALESCE keeps the first-published timestamp: re-publishing an article that
	// was unpublished must not look like a brand-new release.
	p, err := scanProduct(r.pool.QueryRow(ctx,
		`UPDATE products SET
			status = $2,
			published_snapshot = COALESCE($3, published_snapshot),
			published_at = COALESCE(published_at, $4),
			updated_at = now()
		WHERE id = $1 RETURNING `+productColumns,
		id, status, snapshot, stamp))
	return p, err
}

// jsonArray encodes a single value as a one-element JSON array, for the @>
// containment checks above.
func jsonArray(v string) string {
	b, err := json.Marshal([]string{v})
	if err != nil {
		return "[]"
	}
	return string(b)
}
