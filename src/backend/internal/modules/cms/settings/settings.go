// Package settings is the CMS feature-flag admin feature: read (GET) and scoped
// write (PUT) of the cms.* keys in the shared settings registry. CMS gates
// cms.settings.* itself; the scoped writer rejects non-cms.* keys.
package settings

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	settingssvc "github.com/velt/backend/internal/modules/settings"
)

const (
	permRead   = "cms.settings.read"
	permManage = "cms.settings.manage"
)

// UpdateRequest is the PUT /api/cms/settings body. Updates is decoded as raw
// messages so the settings service can tell absent vs explicit null vs a value.
// Only cms.* keys are accepted; an empty/omitted map is a valid no-op.
type UpdateRequest struct {
	Updates map[string]json.RawMessage `json:"updates"`
}

// Service reads/writes the CMS feature flags via the shared settings port.
type Service struct {
	*shared.Base
	port shared.SettingsPort
}

// NewService wires the settings service onto the shared CMS base.
func NewService(base *shared.Base, port shared.SettingsPort) *Service {
	return &Service{Base: base, port: port}
}

// GetSettings returns the CMS feature flags (group "cms"). Requires
// cms.settings.read.
func (s *Service) GetSettings(ctx context.Context, id *httpx.Identity) (settingssvc.GroupedView, error) {
	if err := s.Require(ctx, id, permRead); err != nil {
		return nil, err
	}
	return s.port.GroupView(ctx, shared.GroupCMS)
}

// UpdateSettings writes CMS feature flags. Requires cms.settings.manage; the
// scoped writer rejects any non-cms.* key. Returns the refreshed cms group.
func (s *Service) UpdateSettings(ctx context.Context, id *httpx.Identity, req UpdateRequest) (settingssvc.GroupedView, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return nil, err
	}
	// Capture the current homepage slug BEFORE the write so a change can drop the
	// web's cache for both the old and new home pages (they move between "/" and
	// "/{slug}", which flips their serve/404 behavior — see the web tier).
	changingHome := false
	var oldHome string
	if _, ok := req.Updates[shared.HomePageSlug]; ok {
		changingHome = true
		if cur, gerr := s.port.GroupView(ctx, shared.GroupCMS); gerr == nil {
			oldHome = homeSlugFromView(cur)
		}
	}
	view, err := s.port.UpdateScoped(ctx, id, req.Updates, shared.KeyPrefixCMS, shared.KeyPrefixSite)
	if err != nil {
		return nil, err
	}
	if changingHome {
		if newHome := homeSlugFromView(view); newHome != oldHome {
			s.revalidateHome(ctx, oldHome, newHome)
		}
	}
	return scopedGroup(view, shared.GroupCMS), nil
}

// revalidateHome drops the web ISR cache affected by a homepage-slug change: the
// "settings:home" tag (every route re-reads which slug is the home, so "/{slug}"
// starts/stops 404-ing) plus the old/new pages themselves. Best-effort.
func (s *Service) revalidateHome(ctx context.Context, oldHome, newHome string) {
	tags := []string{"settings:home"}
	if oldHome != "" {
		tags = append(tags, "page:"+oldHome)
	}
	if newHome != "" {
		tags = append(tags, "page:"+newHome)
	}
	s.Revalidate(ctx, tags...)
}

// homeSlugFromView reads the cms.home_page_slug value out of a GroupedView ("" if
// absent/unset).
func homeSlugFromView(view settingssvc.GroupedView) string {
	for _, e := range view[shared.GroupCMS] {
		if e["key"] == shared.HomePageSlug {
			if v, ok := e["value"].(string); ok {
				return v
			}
		}
	}
	return ""
}

// scopedGroup narrows a GroupedView to a single group (non-nil entries) so the
// CMS response never leaks foundation groups.
func scopedGroup(view settingssvc.GroupedView, group string) settingssvc.GroupedView {
	entries := view[group]
	if entries == nil {
		entries = []map[string]any{}
	}
	return settingssvc.GroupedView{group: entries}
}

// Handler is the HTTP layer for CMS settings.
type Handler struct {
	svc *Service
}

// NewHandler builds the settings HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetSettings handles GET /api/cms/settings.
func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.GetSettings(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// UpdateSettings handles PUT /api/cms/settings.
func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateSettings(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Register builds the settings service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router.
func Register(r chi.Router, base *shared.Base, port shared.SettingsPort) {
	h := NewHandler(NewService(base, port))
	r.Get("/settings", h.GetSettings)
	r.Put("/settings", h.UpdateSettings)
}
