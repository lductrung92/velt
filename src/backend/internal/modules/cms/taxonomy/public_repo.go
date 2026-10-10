package taxonomy

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PublicCategoryCard is a category card for public widgets (name/slug + the count
// of published articles in the category).
type PublicCategoryCard struct {
	Slug  string
	Name  string
	Count int
}

// PublicRepo reads categories for public consumption (no auth) — a separate seam
// from the admin Repository for widget resolvers.
type PublicRepo struct{ pool *pgxpool.Pool }

// NewPublicRepository builds the public-read taxonomy repo.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepo { return &PublicRepo{pool: pool} }

// ListCategories returns up to limit categories (by sort order, then name) with a
// published-article count each.
func (r *PublicRepo) ListCategories(ctx context.Context, limit int) ([]PublicCategoryCard, error) {
	if limit < 1 || limit > 50 {
		limit = 12
	}
	rows, err := r.pool.Query(ctx, `
		SELECT c.name, c.slug,
		       (SELECT count(*) FROM cms_articles a WHERE a.category_id = c.id AND a.status = 'published') AS cnt
		  FROM cms_categories c
		 ORDER BY c.sort_order, c.name
		 LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("list public categories: %w", err)
	}
	defer rows.Close()
	out := []PublicCategoryCard{}
	for rows.Next() {
		var c PublicCategoryCard
		if err := rows.Scan(&c.Name, &c.Slug, &c.Count); err != nil {
			return nil, fmt.Errorf("scan public category: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
