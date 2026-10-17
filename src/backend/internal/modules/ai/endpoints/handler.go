package endpoints

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/provider"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/platform/ratelimit"
)

// permSettings is the permission that may read or change the assistant's
// endpoints. Same gate as the rest of the AI admin surface: an API key and a
// list of endpoints the site will talk to is operator territory.
const permSettings = "settings.manage"

// Handler is the admin HTTP surface for endpoints and chains.
type Handler struct {
	svc  *Service
	base *shared.Base
	// limiter guards the one endpoint here that takes a password. Nil is
	// allowed — a deployment without a limiter still works — but then the
	// reveal has only the permission gate and the password itself.
	limiter ratelimit.Limiter
}

// revealPerUser caps password attempts on the reveal endpoint. Keyed by user,
// not by IP: the caller is already signed in, so the account is the thing
// being attacked, and an office behind one address must not share a budget.
const (
	revealPerUser = 5
	revealWindow  = 10 * time.Minute
)

// NewHandler wires the handler.
func NewHandler(svc *Service, base *shared.Base, limiter ratelimit.Limiter) *Handler {
	return &Handler{svc: svc, base: base, limiter: limiter}
}

// RevealKeys handles POST /api/ai/providers/{id}/reveal.
//
// POST, not GET: the body carries a password, and a URL would end up in logs,
// in history and in a proxy's cache. The response is marked no-store for the
// same reason — nothing should keep a copy of this but the screen showing it.
func (h *Handler) RevealKeys(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	ident, _ := httpx.IdentityFromContext(r.Context())
	if ident == nil {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	var req RevealKeysRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if h.limiter != nil {
		ok, retryAfter, err := h.limiter.Allow(r.Context(),
			"ai:reveal:user:"+ident.UserID.String(), revealPerUser, revealWindow)
		// Fails CLOSED, like every other password surface: an unmeasurable
		// run of guesses against a credential store is not worth the
		// convenience of letting it through.
		if err != nil || !ok {
			httpx.WriteError(w, apperr.RateLimited(retryAfter))
			return
		}
	}

	keys, err := h.svc.RevealKeys(r.Context(), ident.UserID, id, req.Password)
	if err != nil {
		h.fail(w, r, "reveal keys", err)
		return
	}
	// Recorded whether or not anyone ever reads it: a credential was shown,
	// and that is the sort of thing somebody has to be able to account for.
	h.svc.RecordReveal(r.Context(), ident, id)

	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, RevealKeysResponse{Keys: keys})
}

func (h *Handler) gate(w http.ResponseWriter, r *http.Request) bool {
	id, _ := httpx.IdentityFromContext(r.Context())
	if err := h.base.Require(r.Context(), id, permSettings); err != nil {
		httpx.WriteError(w, err)
		return false
	}
	return true
}

// ListProviders handles GET /api/ai/providers.
func (h *Handler) ListProviders(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	items, err := h.svc.Providers(r.Context())
	if err != nil {
		h.fail(w, r, "list providers", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ProvidersResponse{Items: items})
}

// CreateProvider handles POST /api/ai/providers.
func (h *Handler) CreateProvider(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	var req CreateProviderRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	p, err := h.svc.CreateProvider(r.Context(), req)
	if err != nil {
		h.fail(w, r, "create provider", err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, p)
}

// UpdateProvider handles PATCH /api/ai/providers/{id}.
func (h *Handler) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	var req UpdateProviderRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	p, err := h.svc.UpdateProvider(r.Context(), id, req)
	if err != nil {
		h.fail(w, r, "update provider", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

// DeleteProvider handles DELETE /api/ai/providers/{id}.
func (h *Handler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	if err := h.svc.DeleteProvider(r.Context(), id); err != nil {
		h.fail(w, r, "delete provider", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ReorderProviders handles PUT /api/ai/providers/order.
func (h *Handler) ReorderProviders(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	var req struct {
		IDs []uuid.UUID `json:"ids" validate:"required"`
	}
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.ReorderProviders(r.Context(), req.IDs); err != nil {
		h.fail(w, r, "reorder providers", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ProviderModels handles GET /api/ai/providers/{id}/models.
func (h *Handler) ProviderModels(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}
	names, err := h.svc.ModelsFor(r.Context(), id, provider.New)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteError(w, apperr.NotFound("not_found"))
			return
		}
		// An endpoint that will not list its models is a finding to show, not
		// a failed request: the operator may simply not have saved a key yet.
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": []string{}, "error": err.Error()})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": names})
}

// GetChain handles GET /api/ai/chains/{purpose}.
func (h *Handler) GetChain(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	purpose, ok := validPurpose(w, r)
	if !ok {
		return
	}
	steps, err := h.svc.Chain(r.Context(), purpose)
	if err != nil {
		h.fail(w, r, "chain", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ChainResponse{Purpose: purpose, Steps: steps})
}

// SetChain handles PUT /api/ai/chains/{purpose}.
func (h *Handler) SetChain(w http.ResponseWriter, r *http.Request) {
	if !h.gate(w, r) {
		return
	}
	purpose, ok := validPurpose(w, r)
	if !ok {
		return
	}
	var req SetChainRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.SetChain(r.Context(), purpose, req.Steps); err != nil {
		h.fail(w, r, "set chain", err)
		return
	}
	steps, err := h.svc.Chain(r.Context(), purpose)
	if err != nil {
		h.fail(w, r, "chain after write", err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ChainResponse{Purpose: purpose, Steps: steps})
}

// validPurpose keeps an unknown purpose out of the store, where the CHECK
// would answer with a database error instead of a readable one.
func validPurpose(w http.ResponseWriter, r *http.Request) (string, bool) {
	p := chi.URLParam(r, "purpose")
	switch shared.Purpose(p) {
	case shared.PurposeChat, shared.PurposeContent:
		return p, true
	}
	httpx.WriteError(w, apperr.Validation(map[string]string{"purpose": "invalid"}))
	return "", false
}

// fail maps a store error onto the wire. A missing row is a 404; anything else
// is logged and reported as an internal error rather than echoed, because the
// text can carry an endpoint URL.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, op string, err error) {
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	// An error that already carries a status was chosen deliberately — a
	// wrong password on the reveal endpoint is a 422, not a server fault.
	// Masking it as 500 both lies to the caller and fills the error log with
	// entries nobody can act on.
	var appErr *apperr.AppError
	if errors.As(err, &appErr) {
		httpx.WriteError(w, appErr)
		return
	}
	h.base.Sec(r.Context()).Error("ai endpoints: "+op, "err", err)
	httpx.WriteError(w, apperr.Internal())
}

// Register mounts the admin surface behind auth.
func Register(r chi.Router, h *Handler, authMW func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/ai/providers", h.ListProviders)
		r.Post("/api/ai/providers", h.CreateProvider)
		r.Put("/api/ai/providers/order", h.ReorderProviders)
		r.Patch("/api/ai/providers/{id}", h.UpdateProvider)
		r.Delete("/api/ai/providers/{id}", h.DeleteProvider)
		r.Post("/api/ai/providers/{id}/reveal", h.RevealKeys)
		r.Get("/api/ai/providers/{id}/models", h.ProviderModels)
		r.Get("/api/ai/chains/{purpose}", h.GetChain)
		r.Put("/api/ai/chains/{purpose}", h.SetChain)
	})
}
