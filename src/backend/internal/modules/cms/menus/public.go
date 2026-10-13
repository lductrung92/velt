package menus

import (
	"context"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// The public (no-auth) read of the navigation: every slot, its item tree, and
// each entity link resolved to the slug it currently lives at.
//
// Three decisions shape the shape of this response.
//
// It does NOT build URLs for article/page/category links. The site owns its URL
// layout (/blog/{slug} today) and guessing a prefix here would be a second place
// to keep it right — the same reason PublicAlternate carries a slug rather than
// a path. The site is handed link_type + slug and does the mapping.
//
// An entity link whose target is gone or unpublished is DROPPED, together with
// everything under it. A menu is rendered to visitors; a link to a 404 is worse
// than one missing entry, and dropping the subtree keeps a child from being
// re-parented to the top level when its parent disappears.
//
// A slot with no items is simply absent from the map. The site reads that as
// "not configured" and renders its built-in navigation, so emptying a menu by
// accident cannot leave a site without one.

// baseLocale is the language content is authored in. An item pointing at
// content with no translation in the requested language still resolves — to the
// Vietnamese address — rather than vanishing from the menu.
const baseLocale = "vi"

// entityMenuItem is this module's key in the translation store
// (translation.EntityMenuItem). An item with no translated label keeps the one
// it was typed with — the rule every translated field follows.
const entityMenuItem = "menu_item"

// PublicItem is one navigation entry as the site reads it. URL is set for
// internal/external links, Slug for article/page/category ones.
type PublicItem struct {
	Label       string       `json:"label"`
	Description *string      `json:"description"`
	LinkType    string       `json:"link_type"`
	URL         *string      `json:"url"`
	Slug        *string      `json:"slug"`
	OpenNewTab  bool         `json:"open_new_tab"`
	Children    []PublicItem `json:"children"`
}

// publicRow is one item row plus the slot it belongs to and its resolved slug.
type publicRow struct {
	itemRow
	Location string
	Slug     *string
}

// PublicRepo reads the whole navigation in one query.
type PublicRepo struct{ pool *pgxpool.Pool }

// NewPublicRepository builds the public-read menu repo.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepo { return &PublicRepo{pool: pool} }

// publicQuery resolves an article/page target through the published read model
// (preferring the requested language, falling back to the base one) and a
// category target straight from the taxonomy, which has no published copy.
const publicQuery = `
	SELECT m.location, i.id, i.parent_id,
	       COALESCE(NULLIF(tr.values ->> 'label', ''), i.label),
	       COALESCE(NULLIF(tr.values ->> 'description', ''), i.description),
	       i.link_type,
	       i.target_id, i.url, i.open_new_tab, i.sort_order,
	       COALESCE(doc.slug, cat.slug)
	  FROM cms_menus m
	  JOIN cms_menu_items i ON i.menu_id = m.id
	  LEFT JOIN translations tr
	         ON tr.entity = $4 AND tr.entity_id = i.id AND tr.locale = $1
	  LEFT JOIN LATERAL (
	       SELECT pd.slug
	         FROM published_docs pd
	        WHERE pd.entity = i.link_type AND pd.entity_id = i.target_id
	          AND pd.is_current AND pd.body IS NOT NULL
	          AND pd.locale IN ($1, $2)
	        ORDER BY (pd.locale = $1) DESC
	        LIMIT 1) doc ON true
	  LEFT JOIN cms_categories cat ON i.link_type = $3 AND cat.id = i.target_id
	 ORDER BY m.location, i.sort_order, i.id`

// All returns every menu item of every slot, ordered by slot then sibling order.
func (r *PublicRepo) All(ctx context.Context, locale string) ([]publicRow, error) {
	rows, err := r.pool.Query(ctx, publicQuery, locale, baseLocale, LinkCategory, entityMenuItem)
	if err != nil {
		return nil, fmt.Errorf("public menus: %w", err)
	}
	defer rows.Close()
	out := []publicRow{}
	for rows.Next() {
		var x publicRow
		if err := rows.Scan(&x.Location, &x.ID, &x.ParentID, &x.Label, &x.Description,
			&x.LinkType, &x.TargetID, &x.URL, &x.OpenNewTab, &x.SortOrder, &x.Slug); err != nil {
			return nil, fmt.Errorf("scan public menu item: %w", err)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// PublicService assembles the rows into one tree per slot.
type PublicService struct{ repo *PublicRepo }

// NewPublicService builds the public menu read service.
func NewPublicService(repo *PublicRepo) *PublicService { return &PublicService{repo: repo} }

// Menus returns the navigation keyed by slot location.
func (s *PublicService) Menus(ctx context.Context, locale string) (map[string][]PublicItem, error) {
	if locale == "" {
		locale = baseLocale
	}
	rows, err := s.repo.All(ctx, locale)
	if err != nil {
		return nil, apperr.Internal()
	}
	byLocation := map[string][]publicRow{}
	for _, r := range rows {
		byLocation[r.Location] = append(byLocation[r.Location], r)
	}
	out := make(map[string][]PublicItem, len(byLocation))
	for location, items := range byLocation {
		if tree := buildPublicTree(items); len(tree) > 0 {
			out[location] = tree
		}
	}
	return out, nil
}

// buildPublicTree nests one slot's rows and drops every entity link that did not
// resolve, along with its descendants.
func buildPublicTree(rows []publicRow) []PublicItem {
	children := map[string][]publicRow{}
	roots := []publicRow{}
	known := map[string]bool{}
	for _, r := range rows {
		known[r.ID.String()] = true
	}
	for _, r := range rows {
		if r.ParentID != nil && known[r.ParentID.String()] {
			key := r.ParentID.String()
			children[key] = append(children[key], r)
			continue
		}
		roots = append(roots, r)
	}
	var materialize func(rs []publicRow) []PublicItem
	materialize = func(rs []publicRow) []PublicItem {
		out := make([]PublicItem, 0, len(rs))
		for _, r := range rs {
			if isEntityLink(r.LinkType) && (r.Slug == nil || *r.Slug == "") {
				continue // target deleted or unpublished — drop it and its subtree
			}
			out = append(out, PublicItem{
				Label: r.Label, Description: r.Description, LinkType: r.LinkType,
				URL: r.URL, Slug: r.Slug, OpenNewTab: r.OpenNewTab,
				Children: materialize(children[r.ID.String()]),
			})
		}
		return out
	}
	return materialize(roots)
}

// isEntityLink reports whether the link points at a record rather than a URL.
func isEntityLink(linkType string) bool {
	switch linkType {
	case LinkArticle, LinkPage, LinkCategory:
		return true
	}
	return false
}

// PublicHandler is the HTTP layer for the public navigation read.
type PublicHandler struct{ svc *PublicService }

// GetMenus handles GET /api/public/cms/menus (every slot, keyed by location).
func (h *PublicHandler) GetMenus(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.Menus(r.Context(), r.URL.Query().Get("locale"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// RegisterPublic mounts the public (no-auth) navigation read.
func RegisterPublic(r chi.Router, pool *pgxpool.Pool) {
	h := &PublicHandler{svc: NewPublicService(NewPublicRepository(pool))}
	r.Get("/menus", h.GetMenus)
}
