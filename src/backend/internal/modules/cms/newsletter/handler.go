package newsletter

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Handler is the HTTP layer for newsletter subscribers.
type Handler struct {
	svc *Service
}

// NewHandler builds the newsletter HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetNewsletterSubscribers handles GET /api/cms/newsletter/subscribers.
func (h *Handler) GetNewsletterSubscribers(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	p := ListParams{
		Status:   r.URL.Query().Get("status"),
		Page:     shared.QueryInt(r, "page", 1),
		PageSize: shared.QueryInt(r, "page_size", 20),
	}
	res, err := h.svc.ListSubscribers(r.Context(), id, p)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteNewsletterSubscriber handles DELETE /api/cms/newsletter/subscribers/{id}.
func (h *Handler) DeleteNewsletterSubscriber(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	subID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteSubscriber(r.Context(), id, subID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}
