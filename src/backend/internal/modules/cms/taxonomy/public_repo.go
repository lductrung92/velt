package taxonomy

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/platform/pubdocs"
)

// PublicCategoryCard is a category card for public widgets (name/slug + the count
// of published articles in the category).
type PublicCategoryCard struct {
	ID    uuid.UUID
	Slug  string
	Name  string
	Count int
}

// PublicRepo reads categories for public consumption (no auth) — a separate seam
// from the admin Repository for widget resolvers.
type PublicRepo struct {
	pool *pgxpool.Pool
	tr   Translator
	log  *slog.Logger
}

// NewPublicRepository builds the public-read taxonomy repo.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepo { return &PublicRepo{pool: pool} }

// SetTranslator wires the translation port (called once at startup); until it is
// set, every card is Vietnamese. The logger comes with it because this seam sits
// below any service — a dropped translation has nowhere else to be reported.
func (r *PublicRepo) SetTranslator(t Translator, log *slog.Logger) {
	r.tr, r.log = t, log
}

// ListCategories returns up to limit categories (by sort order, then name) with a
// published-article count each, in Vietnamese.
func (r *PublicRepo) ListCategories(ctx context.Context, limit int) ([]PublicCategoryCard, error) {
	return r.ListCategoriesIn(ctx, limit, baseLocale)
}

// ListCategoriesIn is ListCategories in one language. An unknown or unconfigured
// locale serves Vietnamese: a visitor who mistypes a query parameter has not
// earned an error page.
func (r *PublicRepo) ListCategoriesIn(ctx context.Context, limit int, locale string) ([]PublicCategoryCard, error) {
	if limit < 1 || limit > 50 {
		limit = 12
	}
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.name, c.slug,
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
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Count); err != nil {
			return nil, fmt.Errorf("scan public category: %w", err)
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	r.translate(ctx, out, r.resolveLocale(ctx, locale))
	return out, nil
}

// resolveLocale maps a requested language onto one that is actually offered.
func (r *PublicRepo) resolveLocale(ctx context.Context, raw string) string {
	want := strings.ToLower(strings.TrimSpace(raw))
	if want == "" || want == baseLocale || r.tr == nil {
		return baseLocale
	}
	for _, l := range r.tr.Locales(ctx) {
		if l == want {
			return want
		}
	}
	return baseLocale
}

// translate overlays the translated name onto the whole page of cards with ONE
// Bundle call, so a twelve-card widget stays two round trips rather than
// thirteen.
//
// Only the name is overlaid. The slug is translatable in the console, but a
// category page still resolves its slug against cms_categories, so linking a
// card at a translated slug would point the visitor at a 404.
//
// A failure is logged and dropped: Vietnamese cards beat a widget that refuses
// to render.
func (r *PublicRepo) translate(ctx context.Context, cards []PublicCategoryCard, locale string) {
	if locale == baseLocale || r.tr == nil || len(cards) == 0 {
		return
	}
	ids := make([]uuid.UUID, len(cards))
	for i := range cards {
		ids[i] = cards[i].ID
	}
	byID, err := r.tr.Bundle(ctx, EntityCategory, ids, []string{locale})
	if err != nil {
		if r.log != nil {
			r.log.Error("cms taxonomy: load category translations", "locale", locale, "err", err)
		}
		return
	}
	for i := range cards {
		values := byID[cards[i].ID][locale]
		if len(values) == 0 {
			continue
		}
		merged := pubdocs.Overlay(map[string]any{"name": cards[i].Name}, values)
		if name, ok := merged["name"].(string); ok {
			cards[i].Name = name
		}
	}
}
