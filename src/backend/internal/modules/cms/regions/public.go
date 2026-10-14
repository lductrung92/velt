package regions

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// The public (no-auth) read of the site's chrome: what each page group's slots
// are made of, each block resolved to the data the site renders.
//
// One read serves every page, and the INHERITANCE IS NOT FLATTENED HERE. The
// site already decides what kind of page it is rendering (resolveRoute), so it
// walks the group chain itself; asking per group would mean one response per
// page kind and the layout cache behind it is one entry per language.
//
// Two decisions shape this response, and they are the same decision twice.
//
// A group or slot with no VISIBLE blocks is absent from the map entirely — the
// rule menus' public read already follows for an empty slot. The site reads
// absence as "not configured" and renders the chrome it ships with, so hiding
// the last block by accident cannot leave a page with no header.
//
// A block that does not resolve — a menu with nothing left to render, a widget
// whose data source answers with an error — is DROPPED rather than failing the
// request. This one response renders every page's chrome: one bad block must
// not blank the site. The drop is logged, because a block that vanishes
// silently is a bug report nobody can write.

// MenuPort resolves menus the way the public navigation read does, keyed by
// menu id. It is satisfied in-process by menus.PublicService; declared here so
// regions does not import the menus package (the CMS dependency graph is
// feature → shared, never feature → feature), and its items are carried as
// `any` for the same reason — the shape belongs to menus and this response
// only forwards it. A nil port drops every menu block.
type MenuPort interface {
	ItemsByMenu(ctx context.Context, locale string) (map[uuid.UUID]any, error)
}

// resolvedMenu is a menu block as the site reads it: the menu's items, already
// resolved. The block carries no config, so there is nothing else to send.
type resolvedMenu struct {
	Kind  string `json:"kind"`
	Items any    `json:"items"`
}

// resolvedWidget is a widget block as the site reads it.
//
// It carries the config as well as the resolved data, the same pair
// pages.PublicBlock sends, and for the same reason: a static widget — rich
// text, a CTA banner — resolves to nil because its CONFIG is the content. Send
// only `data` and those two render nothing at all.
type resolvedWidget struct {
	Kind       string          `json:"kind"`
	WidgetType string          `json:"widget_type"`
	Config     json.RawMessage `json:"config"`
	Data       any             `json:"data"`
}

// publicRow is one visible block, without the fields only the editor needs.
type publicRow struct {
	Group      string
	Region     string
	Kind       string
	WidgetType *string
	MenuID     *uuid.UUID
	Config     []byte
}

// PublicRepo reads every visible block in one query.
type PublicRepo struct{ pool *pgxpool.Pool }

// NewPublicRepository builds the public-read region block repo.
func NewPublicRepository(pool *pgxpool.Pool) *PublicRepo { return &PublicRepo{pool: pool} }

// Visible returns every visible block of every (group, slot), in render order.
func (r *PublicRepo) Visible(ctx context.Context) ([]publicRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT page_group, region, kind, widget_type, menu_id, config
		  FROM cms_region_blocks WHERE is_visible
		 ORDER BY page_group, region, sort_order, id`)
	if err != nil {
		return nil, fmt.Errorf("public region blocks: %w", err)
	}
	defer rows.Close()
	out := []publicRow{}
	for rows.Next() {
		var x publicRow
		if err := rows.Scan(&x.Group, &x.Region, &x.Kind, &x.WidgetType, &x.MenuID, &x.Config); err != nil {
			return nil, fmt.Errorf("scan public region block: %w", err)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// PublicService resolves the blocks into the chrome the site renders.
type PublicService struct {
	repo     *PublicRepo
	resolver *widgets.Resolver
	menus    MenuPort
	log      *slog.Logger
}

// NewPublicService builds the public chrome read service over the widget
// resolver and the menu port.
func NewPublicService(repo *PublicRepo, resolver *widgets.Resolver, menus MenuPort, log *slog.Logger) *PublicService {
	if log == nil {
		log = slog.Default()
	}
	return &PublicService{repo: repo, resolver: resolver, menus: menus, log: log}
}

// Chrome returns the resolved blocks keyed by group, then by slot. An empty
// locale is the base language, which is what the resolver and the menu port
// already fall back to.
func (s *PublicService) Chrome(ctx context.Context, locale string) (map[string]map[string][]any, error) {
	rows, err := s.repo.Visible(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	// One lookup for every menu block on the page, resolved by the navigation
	// read itself so a menu in the header and the same menu as navigation can
	// never render differently.
	items := map[uuid.UUID]any{}
	if s.menus != nil {
		if items, err = s.menus.ItemsByMenu(ctx, locale); err != nil {
			return nil, apperr.Internal()
		}
	}
	out := map[string]map[string][]any{}
	for _, r := range rows {
		block, ok := s.resolve(ctx, r, items, locale)
		if !ok {
			continue
		}
		if out[r.Group] == nil {
			out[r.Group] = map[string][]any{}
		}
		out[r.Group][r.Region] = append(out[r.Group][r.Region], block)
	}
	return out, nil
}

// resolve turns one row into the block the site renders, or reports that it
// could not be resolved and must be dropped.
func (s *PublicService) resolve(ctx context.Context, r publicRow, items map[uuid.UUID]any, locale string) (any, bool) {
	if r.Kind == KindMenu {
		// Absent covers both halves of the same accident: the menu was deleted,
		// or it is empty and has nothing to render.
		got, ok := items[*r.MenuID]
		if !ok {
			s.log.Warn("public chrome block dropped: menu did not resolve",
				"group", r.Group, "slot", r.Region, "menu", *r.MenuID, "locale", locale)
			return nil, false
		}
		return resolvedMenu{Kind: KindMenu, Items: got}, true
	}
	data, err := s.resolver.ResolveIn(ctx, *r.WidgetType, r.Config, locale)
	if err != nil {
		s.log.Warn("public chrome block dropped: widget did not resolve",
			"group", r.Group, "slot", r.Region, "widget_type", *r.WidgetType, "locale", locale, "error", err)
		return nil, false
	}
	return resolvedWidget{
		Kind:       KindWidget,
		WidgetType: *r.WidgetType,
		Config:     r.Config,
		Data:       data,
	}, true
}

// PublicHandler is the HTTP layer for the public chrome read.
type PublicHandler struct{ svc *PublicService }

// GetRegions handles GET /api/public/cms/regions (every configured group).
func (h *PublicHandler) GetRegions(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.Chrome(r.Context(), r.URL.Query().Get("locale"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// RegisterPublic mounts the public (no-auth) chrome read.
func RegisterPublic(r chi.Router, pool *pgxpool.Pool, resolver *widgets.Resolver, menus MenuPort, log *slog.Logger) {
	h := &PublicHandler{svc: NewPublicService(NewPublicRepository(pool), resolver, menus, log)}
	r.Get("/regions", h.GetRegions)
}
