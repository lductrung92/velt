package comments

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for comment moderation.
type Handler struct {
	svc *Service
}

// NewHandler builds the comments HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetComments handles GET /api/cms/comments (moderation queue).
func (h *Handler) GetComments(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	p := ListParams{
		Status:    r.URL.Query().Get("status"),
		ArticleID: shared.QueryUUID(r, "article_id"),
		Page:      shared.QueryInt(r, "page", 1),
		PageSize:  shared.QueryInt(r, "page_size", 20),
	}
	res, err := h.svc.ListComments(r.Context(), id, p)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// UpdateComment handles PATCH /api/cms/comments/{id} (moderation decision).
func (h *Handler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	commentID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateComment(r.Context(), id, commentID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteComment handles DELETE /api/cms/comments/{id}.
func (h *Handler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	commentID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteComment(r.Context(), id, commentID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}
