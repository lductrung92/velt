package regions

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for region blocks.
type Handler struct {
	svc *Service
}

// NewHandler builds the regions HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetRegions handles GET /api/cms/regions (every group, every slot it allows,
// and the blocks in it).
func (h *Handler) GetRegions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.ListRegions(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ReplaceRegionBlocks handles PUT /api/cms/regions/{group}/{slot}/blocks
// (whole-list replace). A pair outside the matrix is a 422, not a 404: the
// group and the slot are values the caller sent, and the vocabulary is what
// they failed against.
func (h *Handler) ReplaceRegionBlocks(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req BlocksRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.ReplaceRegionBlocks(r.Context(), id,
		chi.URLParam(r, "group"), chi.URLParam(r, "slot"), req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
