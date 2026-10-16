package menus

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for menus.
type Handler struct {
	svc *Service
}

// NewHandler builds the menus HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetMenus handles GET /api/cms/menus (list slots, no items).
func (h *Handler) GetMenus(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListMenus(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetMenu handles GET /api/cms/menus/{id} (slot + item tree).
func (h *Handler) GetMenu(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	menuID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.GetMenu(r.Context(), id, menuID, httpx.Locale(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateMenu handles POST /api/cms/menus.
func (h *Handler) CreateMenu(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateMenu(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateMenu handles PATCH /api/cms/menus/{id}.
func (h *Handler) UpdateMenu(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	menuID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateMenu(r.Context(), id, menuID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteMenu handles DELETE /api/cms/menus/{id}.
func (h *Handler) DeleteMenu(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	menuID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteMenu(r.Context(), id, menuID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// ReplaceMenuItems handles PUT /api/cms/menus/{id}/items (whole-tree replace).
func (h *Handler) ReplaceMenuItems(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	menuID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req ItemsRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.ReplaceMenuItems(r.Context(), id, menuID, req, httpx.Locale(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
