package translation

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for the console's translation routes.
type Handler struct{ svc *Service }

// NewHandler builds the translation HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// putRequest is the body of PUT /api/translations/{entity}/{id}/{locale}.
type putRequest struct {
	Values Values `json:"values"`
}

func target(r *http.Request) (string, uuid.UUID, bool) {
	entity := chi.URLParam(r, "entity")
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	return entity, id, err == nil
}

// normalizeLocale lower-cases the path segment so /en and /EN are one language.
func normalizeLocale(r *http.Request) string {
	return strings.ToLower(strings.TrimSpace(chi.URLParam(r, "locale")))
}

// Get handles GET /api/translations/{entity}/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	entity, entityID, ok := target(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	res, err := h.svc.Get(r.Context(), id, entity, entityID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Put handles PUT /api/translations/{entity}/{id}/{locale}.
func (h *Handler) Put(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	entity, entityID, ok := target(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	var req putRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Put(r.Context(), id, entity, entityID, normalizeLocale(r), req.Values)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// Delete handles DELETE /api/translations/{entity}/{id}/{locale}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	entity, entityID, ok := target(r)
	if !ok {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.svc.Delete(r.Context(), id, entity, entityID, normalizeLocale(r)); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Register mounts the translation routes on the already-authenticated /api
// router and returns the service, which the content modules take as a port.
//
// There is no permission of its own here: every route defers to the owning
// module's gate through the Authorizer. A `translation.manage` permission would
// let somebody rewrite the words of content they may not open.
func Register(r chi.Router, pool *pgxpool.Pool, settings SettingsPort,
	authMW func(http.Handler) http.Handler, authz Authorizer,
) *Service {
	svc := NewService(NewStore(pool), settings, authz)
	h := NewHandler(svc)
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/translations/{entity}/{id}", h.Get)
		r.Put("/api/translations/{entity}/{id}/{locale}", h.Put)
		r.Delete("/api/translations/{entity}/{id}/{locale}", h.Delete)
	})
	return svc
}
