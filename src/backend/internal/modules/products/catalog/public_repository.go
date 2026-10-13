package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// PublicRepository reads the published catalog.
//
// The list and the detail read the shared public read model (published_docs),
// where the frozen copy and its translations live: one row per published URL,
// so asking for a language is asking for a row rather than a second code path.
// Everything a visitor can SEE, including what they filter and sort by, comes
// from that frozen body — a draft edit cannot change which products a filter
// returns while the product page still shows the old content.
//
// The category vocabulary below still reads `published_snapshot` directly: it
// is a Vietnamese-only filter list, and moving it is a separate change.
type PublicRepository struct {
	pool *pgxpool.Pool
	docs *pubdocs.Store
}

// NewPublicRepository builds the public catalog reader.
func NewPublicRepository(pool *pgxpool.Pool, docs *pubdocs.Store) *PublicRepository {
	return &PublicRepository{pool: pool, docs: docs}
}

// ErrMoved reports that the requested slug is no longer the product's address
// in the language asked for. The caller answers 301 rather than 404, so links
// already handed out survive a rename and the ranking that URL earned is kept.
type ErrMoved struct{ Slug string }

func (e ErrMoved) Error() string { return "product moved to " + e.Slug }

// PublishedProduct is one published document: the frozen body plus every
// language the product is live in, including the one being read — hreflang is
// ignored unless each version points at the others AND at itself.
type PublishedProduct struct {
	Body       json.RawMessage
	Alternates []pubdocs.Ref
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
		return `body->>'name' ASC`
	case "newest":
		return `published_at DESC NULLS LAST, body->>'name' ASC`
	default: // "featured"
		return `(body->>'is_featured')::boolean DESC,
		        (body->>'sort_order')::int ASC,
		        body->>'name' ASC`
	}
}

// ListPublished returns one page of published documents plus the total.
//
// It queries published_docs directly rather than through pubdocs.Store.List:
// the catalog filters and sorts on fields inside the body (category, lifecycle,
// audience, platform, curation order), which the shared list helper does not
// take. The visibility predicate is the shared one — a live row with a body.
func (r *PublicRepository) ListPublished(ctx context.Context, p PublicListParams) ([]json.RawMessage, int, error) {
	// One row per product: its copy in the language asked for, or the base one.
	// A product published before a language was switched on has no row in that
	// language, and without this it would simply be absent from the catalogue —
	// not untranslated, gone. Same rule as pubdocs.Store.List; the filters below
	// then run on whichever copy was chosen, which is the copy the reader sees.
	const live = `
		WITH live AS (
		  SELECT DISTINCT ON (entity_id) body, published_at, search_text
		    FROM published_docs
		   WHERE entity = $1 AND locale IN ($2, $3)
		     AND is_current AND body IS NOT NULL
		   ORDER BY entity_id, (locale = $2) DESC
		)`
	conds := []string{"true"}
	args := []any{EntityProduct, p.Locale, pubdocs.BaseLocale}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}

	if p.Query != "" {
		// search_text holds name + summary, the pair this used to ILIKE over two
		// JSON fields — same matches, but on a trigram-indexed column.
		add(`search_text ILIKE '%%' || $%d || '%%'`, p.Query)
	}
	if p.Category != "" {
		// Containment, not a join: the body carries the categories the product
		// had when it was published.
		add(`body->'categories' @> $%d::jsonb`,
			`[{"slug":`+jsonScalar(p.Category)+`}]`)
	}
	if p.Lifecycle != "" {
		add(`body->>'lifecycle' = $%d`, p.Lifecycle)
	}
	if p.Audience != "" {
		add(`body->'audience' @> $%d::jsonb`, jsonScalar(p.Audience))
	}
	if p.Platform != "" {
		add(`body->'platforms' @> $%d::jsonb`, jsonScalar(p.Platform))
	}
	if p.Featured != nil {
		add(`(body->>'is_featured')::boolean = $%d`, *p.Featured)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		live+` SELECT count(*) FROM live WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, shared.Wrap("count published products", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx,
		live+` SELECT body FROM live WHERE `+where+
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

// GetPublishedBySlug returns one published product in the requested language.
//
// Three outcomes besides the product: shared.ErrNotFound, and ErrMoved either
// because the slug was retired by a rename, or because it is another language's
// address for the same product. Both get a 301 instead of a 404, which is what
// keeps one product from living at two indexable URLs.
func (r *PublicRepository) GetPublishedBySlug(ctx context.Context, locale, slug string) (*PublishedProduct, error) {
	found, err := r.docs.Get(ctx, EntityProduct, locale, slug)
	if errors.Is(err, pubdocs.ErrNotFound) {
		return nil, r.crossLocaleRedirect(ctx, locale, slug)
	}
	if err != nil {
		return nil, shared.Wrap("get published product", err)
	}
	if !found.IsCurrent {
		return nil, ErrMoved{Slug: found.CurrentSlug}
	}
	alts, err := r.docs.Alternates(ctx, EntityProduct, found.EntityID)
	if err != nil {
		return nil, shared.Wrap("product alternates", err)
	}
	return &PublishedProduct{Body: found.Body, Alternates: alts}, nil
}

// crossLocaleRedirect handles a slug that exists, but belongs to a different
// language of the same product — the case where a visitor lands on /en/<the
// Vietnamese slug> after a translated slug was set. It always returns an error.
func (r *PublicRepository) crossLocaleRedirect(ctx context.Context, locale, slug string) error {
	if locale == baseLocale {
		return shared.ErrNotFound
	}
	base, err := r.docs.Get(ctx, EntityProduct, baseLocale, slug)
	if err != nil || !base.IsCurrent {
		return shared.ErrNotFound
	}
	alts, err := r.docs.Alternates(ctx, EntityProduct, base.EntityID)
	if err != nil {
		return shared.Wrap("product alternates", err)
	}
	for _, a := range alts {
		if a.Locale == locale {
			return ErrMoved{Slug: a.Slug}
		}
	}
	return shared.ErrNotFound
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
