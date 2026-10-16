package categories

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/shared"
)

// Repository is the product-category persistence port. The service depends on
// this interface so it can be unit-tested against a fake.
type Repository interface {
	List(ctx context.Context, status string) ([]Category, error)
	Get(ctx context.Context, id uuid.UUID) (*Category, error)
	Create(ctx context.Context, w write) (*Category, error)
	Update(ctx context.Context, id uuid.UUID, w write) (*Category, error)
	Delete(ctx context.Context, id uuid.UUID) error
	SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	Reorder(ctx context.Context, ids []uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed category repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// returningColumns is the same list unqualified: RETURNING has no table alias.
const returningColumns = `id, slug, name, description, sort_order, status,
	seo_title, seo_description, seo_keywords, created_at, updated_at`

const categoryColumns = `c.id, c.slug, c.name, c.description, c.sort_order, c.status,
	c.seo_title, c.seo_description, c.seo_keywords, c.created_at, c.updated_at`

func scanCategory(row pgx.Row) (*Category, error) {
	var c Category
	err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.SortOrder, &c.Status,
		&c.SEOTitle, &c.SEODescription, &c.SEOKeywords, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan product category: %w", err)
	}
	return &c, nil
}

// List returns the taxonomy. An empty status is no filter; otherwise only
// categories in that status come back.
func (r *pgxRepository) List(ctx context.Context, status string) ([]Category, error) {
	// The count comes from a correlated subquery rather than a GROUP BY join so
	// a category with no products still appears, with 0.
	rows, err := r.pool.Query(ctx,
		`SELECT `+categoryColumns+`,
		        (SELECT count(*) FROM product_category_links l WHERE l.category_id = c.id)
		 FROM product_categories c
		 WHERE $1 = '' OR c.status = $1
		 ORDER BY c.sort_order, c.name`, status)
	if err != nil {
		return nil, shared.Wrap("list product categories", err)
	}
	defer rows.Close()

	out := make([]Category, 0, 8)
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.SortOrder, &c.Status,
			&c.SEOTitle, &c.SEODescription, &c.SEOKeywords, &c.CreatedAt, &c.UpdatedAt,
			&c.ProductCount); err != nil {
			return nil, shared.Wrap("scan product category", err)
		}
		out = append(out, c)
	}
	return out, shared.Wrap("list product categories", rows.Err())
}

func (r *pgxRepository) Get(ctx context.Context, id uuid.UUID) (*Category, error) {
	return scanCategory(r.pool.QueryRow(ctx,
		`SELECT `+categoryColumns+` FROM product_categories c WHERE c.id = $1`, id))
}

func (r *pgxRepository) Create(ctx context.Context, w write) (*Category, error) {
	c, err := scanCategory(r.pool.QueryRow(ctx,
		`INSERT INTO product_categories
		     (slug, name, description, sort_order, status, seo_title, seo_description, seo_keywords)
		 VALUES ($1, $2, $3,
		         COALESCE($4, (SELECT COALESCE(max(sort_order), -1) + 1 FROM product_categories)),
		         $5, $6, $7, $8)
		 RETURNING `+returningColumns,
		w.Slug, w.Name, w.Description, w.SortOrder, w.Status,
		w.SEOTitle, w.SEODescription, w.SEOKeywords))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return c, err
}

func (r *pgxRepository) Update(ctx context.Context, id uuid.UUID, w write) (*Category, error) {
	c, err := scanCategory(r.pool.QueryRow(ctx,
		`UPDATE product_categories
		 SET slug = $2, name = $3, description = $4, sort_order = $5, status = $6,
		     seo_title = $7, seo_description = $8, seo_keywords = $9, updated_at = now()
		 WHERE id = $1 RETURNING `+returningColumns,
		id, w.Slug, w.Name, w.Description, w.SortOrder, w.Status,
		w.SEOTitle, w.SEODescription, w.SEOKeywords))
	if err != nil && shared.IsUniqueViolation(err) {
		return nil, shared.ErrConflict
	}
	return c, err
}

func (r *pgxRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM product_categories WHERE id = $1`, id)
	if err != nil {
		return shared.Wrap("delete product category", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}

func (r *pgxRepository) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM product_categories WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, shared.Wrap("product category slug exists", err)
}

// Reorder rewrites sort_order to match the given id order in one statement, so a
// partial failure cannot leave the taxonomy half-sorted. Ids that no longer
// exist are ignored; rows not listed keep their current sort_order.
func (r *pgxRepository) Reorder(ctx context.Context, ids []uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE product_categories c SET sort_order = o.ord, updated_at = now()
		 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
		 WHERE c.id = o.id`, ids)
	return shared.Wrap("reorder product categories", err)
}
