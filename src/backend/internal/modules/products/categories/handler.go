package categories

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for product categories. It decodes/validates,
// delegates to the service, and writes the response — no business rules here.
type Handler struct {
	svc *Service
}

// NewHandler builds the category HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// identity pulls the authenticated caller; absent means the route was mounted
// without the auth middleware, which is a wiring bug.
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

// List handles GET /api/product-categories.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	res, err := h.svc.List(r.Context(), id, httpx.Locale(r), r.URL.Query().Get("status"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Create handles POST /api/product-categories.
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

// Update handles PATCH /api/product-categories/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	catID, ok := pathID(w, r)
	if !ok {
		return
	}
	var req UpdateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Update(r.Context(), id, catID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Delete handles DELETE /api/product-categories/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	catID, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), id, catID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// Reorder handles PUT /api/product-categories/order.
func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	id, ok := identity(w, r)
	if !ok {
		return
	}
	var req ReorderRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), id, req.IDs); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusNoContent, nil)
}

// Register mounts the category routes. `/order` is declared before `/{id}` so
// the literal segment is obviously the more specific match to the next reader.
func Register(r chi.Router, base *Service, authMW func(http.Handler) http.Handler) {
	h := NewHandler(base)
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/product-categories", h.List)
		r.Post("/api/product-categories", h.Create)
		r.Put("/api/product-categories/order", h.Reorder)
		r.Patch("/api/product-categories/{id}", h.Update)
		r.Delete("/api/product-categories/{id}", h.Delete)
	})
	// The public read of this collection belongs to catalog.RegisterPublic,
	// which serves a deliberately narrow projection. Registering a second
	// handler for the same path here meant chi kept whichever one was wired
	// last — and this package's version was the admin read with its permission
	// check removed, one reordering away from being served to anonymous callers.
}
