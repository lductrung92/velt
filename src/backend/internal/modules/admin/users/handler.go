package users

import (
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
)

// Handler is the HTTP layer for user management.
type Handler struct {
	svc *Service
}

// NewHandler builds the users HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ListUsers handles GET /api/admin/users.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	res, err := h.svc.ListUsers(r.Context(), id, ListUsersFilter{
		Query:    q.Get("q"),
		Status:   q.Get("status"),
		Page:     shared.QueryInt(r, "page"),
		PageSize: shared.QueryInt(r, "page_size"),
		Sort:     q.Get("sort"),
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetUser handles GET /api/admin/users/{id}.
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.GetUser(r.Context(), id, target)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// CreateUser handles POST /api/admin/users.
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	var req CreateUserRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.CreateUser(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// UpdateUser handles PATCH /api/admin/users/{id}.
func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req UpdateUserRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.UpdateUser(r.Context(), id, target, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// DeleteUser handles DELETE /api/admin/users/{id} (soft; ?hard=true for super_admin).
func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.DeleteUser(r.Context(), id, target, r.URL.Query().Get("hard") == "true"); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// AssignRole handles POST /api/admin/users/{id}/roles.
func (h *Handler) AssignRole(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req AssignRoleRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.AssignRole(r.Context(), id, target, req.RoleID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// RemoveRole handles DELETE /api/admin/users/{id}/roles/{role_id}.
func (h *Handler) RemoveRole(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok1 := shared.ParamUUID(r, "id")
	roleID, ok2 := shared.ParamUUID(r, "role_id")
	if !ok1 || !ok2 {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.RemoveRole(r.Context(), id, target, roleID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// ResetPassword handles POST /api/admin/users/{id}/reset-password.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := shared.Identity(w, r)
	if !ok {
		return
	}
	target, ok := shared.ParamUUID(r, "id")
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.TriggerResetPassword(r.Context(), id, target); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}
