package pages

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for static pages.
type Handler struct {
	svc *Service
}

// NewHandler builds the pages HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetPages handles GET /api/cms/pages (full tree).
func (h *Handler) GetPages(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListPages(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetPage handles GET /api/cms/pages/{id}.
func (h *Handler) GetPage(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	pageID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.GetPage(r.Context(), id, pageID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreatePage handles POST /api/cms/pages.
func (h *Handler) CreatePage(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreatePageRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreatePage(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdatePage handles PATCH /api/cms/pages/{id}.
func (h *Handler) UpdatePage(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	pageID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdatePageRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdatePage(r.Context(), id, pageID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeletePage handles DELETE /api/cms/pages/{id}.
func (h *Handler) DeletePage(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	pageID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeletePage(r.Context(), id, pageID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// PublishPage handles POST /api/cms/pages/{id}/publish.
func (h *Handler) PublishPage(w http.ResponseWriter, r *http.Request) {
	h.statusAction(w, r, h.svc.PublishPage)
}

// UnpublishPage handles POST /api/cms/pages/{id}/unpublish.
func (h *Handler) UnpublishPage(w http.ResponseWriter, r *http.Request) {
	h.statusAction(w, r, h.svc.UnpublishPage)
}

func (h *Handler) statusAction(w http.ResponseWriter, r *http.Request,
	action func(context.Context, *httpx.Identity, uuid.UUID) (PageDetailResponse, error)) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	pageID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := action(r.Context(), id, pageID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
