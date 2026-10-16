package sessions

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
)

// Handler is the HTTP layer for session control.
type Handler struct {
	svc *Service
}

// NewHandler builds the sessions HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ListSessions handles GET /api/admin/sessions.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	f := ListFilter{
		Active:   r.URL.Query().Get("active") == "true",
		Page:     shared.QueryInt(r, "page"),
		PageSize: shared.QueryInt(r, "page_size"),
	}
	if raw := r.URL.Query().Get("user_id"); raw != "" {
		uid, err := uuid.Parse(raw)
		if err != nil {
			httpx.WriteError(w, apperr.Validation(map[string]string{"user_id": "invalid_uuid"}))
			return
		}
		f.UserID = &uid
	}
	res, err := h.svc.ListSessions(r.Context(), id, f)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// RevokeSession handles DELETE /api/admin/sessions/{id}.
func (h *Handler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	sessionID, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.RevokeSession(r.Context(), id, sessionID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// PurgeSessions handles POST /api/admin/sessions/purge.
func (h *Handler) PurgeSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req PurgeRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.PurgeSessions(r.Context(), id, strings.TrimSpace(req.OlderThan))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetUserSessions handles GET /api/admin/users/{id}/sessions.
func (h *Handler) GetUserSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.ListSessions(r.Context(), id, ListFilter{
		UserID: &target, Page: shared.QueryInt(r, "page"), PageSize: shared.QueryInt(r, "page_size"),
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// RevokeUserSessions handles DELETE /api/admin/users/{id}/sessions.
func (h *Handler) RevokeUserSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.RevokeUserSessions(r.Context(), id, target); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}
