package leads

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for the console-facing leads routes.
type Handler struct {
	svc *Service
}

// NewHandler builds the leads handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func identity(w http.ResponseWriter, r *http.Request) (*httpx.Identity, bool) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return nil, false
	}
	return id, true
}

func pathID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return uuid.Nil, false
	}
	return id, true
}

func listParams(r *http.Request) ListParams {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("page_size"))
	return ListParams{
		Query:    strings.TrimSpace(q.Get("q")),
		Status:   q.Get("status"),
		Source:   q.Get("source"),
		Assignee: q.Get("assignee"),
		Page:     page,
		PageSize: size,
	}
}

// List handles GET /api/crm/leads.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.List(r.Context(), id, listParams(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Get handles GET /api/crm/leads/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	leadID, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Get(r.Context(), id, leadID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Create handles POST /api/crm/leads.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	var req CreateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Create(r.Context(), id, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, res)
}

// Update handles PATCH /api/crm/leads/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	leadID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Update(r.Context(), id, leadID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Delete handles DELETE /api/crm/leads/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	leadID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), id, leadID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Register mounts the console-facing leads routes. There is no public surface:
// the assistant creates leads in-process through Service.CaptureFromChat, not
// over HTTP, so there is no unauthenticated write endpoint to defend.
func Register(r chi.Router, svc *Service, authMW func(http.Handler) http.Handler) {
	h := NewHandler(svc)
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/crm/leads", h.List)
		r.Post("/api/crm/leads", h.Create)
		r.Get("/api/crm/leads/{id}", h.Get)
		r.Patch("/api/crm/leads/{id}", h.Update)
		r.Delete("/api/crm/leads/{id}", h.Delete)
	})
}
