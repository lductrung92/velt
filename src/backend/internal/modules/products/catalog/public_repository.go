package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/shared"
)

// PublicRepository reads the published catalog.
//
// Visibility comes from the live `status` column — that is the editorial switch.
// Everything a visitor can SEE, including what they filter and sort by, comes
// from `published_snapshot`. Mixing the two would let an unpublished draft edit
// change which products a filter returns while the product page still shows the
// old content, so the list and the detail page would disagree.
type PublicRepository struct {
	pool *pgxpool.Pool
}

// NewPublicRepository builds the public catalog reader.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepository {
	return &PublicRepository{pool: pool}
}

// publishedOnly is the visibility predicate, used by every query here. A row
// with no snapshot has never been published, so it has nothing to show even if
// the status says otherwise.
const publishedOnly = `status = 'published' AND published_snapshot IS NOT NULL`

// jsonScalar encodes v as a JSON scalar for a jsonb containment test.
func jsonScalar(v string) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func publicSortClause(sort string) string {
	switch sort {
	case "name":
		return `published_snapshot->>'name' ASC`
	case "newest":
		return `published_at DESC NULLS LAST, published_snapshot->>'name' ASC`
	default: // "featured"
		return `(published_snapshot->>'is_featured')::boolean DESC,
		        (published_snapshot->>'sort_order')::int ASC,
		        published_snapshot->>'name' ASC`
	}
}

// ListPublished returns one page of published snapshots plus the total.
func (r *PublicRepository) ListPublished(ctx context.Context, p PublicListParams) ([]json.RawMessage, int, error) {
	conds := []string{publishedOnly}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}

	if p.Query != "" {
		add(`(published_snapshot->>'name' ILIKE '%%' || $%d || '%%'
		   OR published_snapshot->>'summary' ILIKE '%%' || $%[1]d || '%%')`, p.Query)
	}
	if p.Category != "" {
		// Containment, not a join: the snapshot carries the categories the
		// product had when it was published.
		add(`published_snapshot->'categories' @> $%d::jsonb`,
			`[{"slug":`+jsonScalar(p.Category)+`}]`)
	}
	if p.Lifecycle != "" {
		add(`published_snapshot->>'lifecycle' = $%d`, p.Lifecycle)
	}
	if p.Audience != "" {
		add(`published_snapshot->'audience' @> $%d::jsonb`, jsonScalar(p.Audience))
	}
	if p.Platform != "" {
		add(`published_snapshot->'platforms' @> $%d::jsonb`, jsonScalar(p.Platform))
	}
	if p.Featured != nil {
		add(`(published_snapshot->>'is_featured')::boolean = $%d`, *p.Featured)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM products WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, shared.Wrap("count published products", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx,
		`SELECT published_snapshot FROM products WHERE `+where+
			` ORDER BY `+publicSortClause(p.Sort)+
			fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, shared.Wrap("list published products", err)
	}
	defer rows.Close()

	out := []json.RawMessage{}
	for rows.Next() {
		var snap json.RawMessage
		if err := rows.Scan(&snap); err != nil {
			return nil, 0, shared.Wrap("scan published product", err)
		}
		out = append(out, snap)
	}
	return out, total, rows.Err()
}

// GetPublishedBySlug returns one published snapshot. The slug is matched on the
// live column: a slug change takes effect immediately for routing, while the
// content served stays the frozen one until the next publish.
func (r *PublicRepository) GetPublishedBySlug(ctx context.Context, slug string) (json.RawMessage, error) {
	var snap json.RawMessage
	err := r.pool.QueryRow(ctx,
		`SELECT published_snapshot FROM products WHERE slug = $1 AND `+publishedOnly, slug,
	).Scan(&snap)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, shared.ErrNotFound
		}
		return nil, shared.Wrap("get published product", err)
	}
	return snap, nil
}

// PublicCategory is a taxonomy entry the site can offer as a filter.
type PublicCategory struct {
	Slug         string
	Name         string
	ProductCount int
}

// ListPublicCategories returns only categories that currently have at least one
// published product, with that count.
//
// Empty categories are left out on purpose: the site uses this list to build
// filters, and a filter that can only ever return nothing is a dead end. The
// count comes from the snapshots, so it agrees with what the list endpoint
// returns for the same slug.
func (r *PublicRepository) ListPublicCategories(ctx context.Context) ([]PublicCategory, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.slug, c.name, count(p.id)
		  FROM product_categories c
		  JOIN products p
		    ON p.status = 'published'
		   AND p.published_snapshot IS NOT NULL
		   AND p.published_snapshot->'categories' @> jsonb_build_array(
		         jsonb_build_object('slug', c.slug))
		 GROUP BY c.slug, c.name, c.sort_order
		 ORDER BY c.sort_order, c.name`)
	if err != nil {
		return nil, shared.Wrap("list public categories", err)
	}
	defer rows.Close()

	out := []PublicCategory{}
	for rows.Next() {
		var c PublicCategory
		if err := rows.Scan(&c.Slug, &c.Name, &c.ProductCount); err != nil {
			return nil, shared.Wrap("scan public category", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// IDsBySlugs resolves published product slugs to ids.
//
// In-process only: the public HTTP responses deliberately carry slugs and no
// ids, and that stays true. This exists so another context (the assistant
// recording which products a lead asked about) can store a real reference
// instead of a string that will rot.
func (r *PublicRepository) IDsBySlugs(ctx context.Context, slugs []string) ([]uuid.UUID, error) {
	if len(slugs) == 0 {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id FROM products WHERE slug = ANY($1) AND `+publishedOnly, slugs)
	if err != nil {
		return nil, shared.Wrap("ids by slugs", err)
	}
	defer rows.Close()

	out := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, shared.Wrap("scan product id", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
