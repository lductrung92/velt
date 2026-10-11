package mcp

import (
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// maxBody bounds a JSON-RPC envelope. Generous for a tool call, small enough
// that an unauthenticated POST cannot be used to push memory around.
const maxBody = 1 << 20

// permUse is required to mint or list credentials. Using one needs nothing
// extra: the token IS the authentication.
const permUse = "ai.mcp.use"

// Handler serves the MCP endpoint and the credential management behind it.
type Handler struct {
	srv    *Server
	tokens *TokenStore
	ident  IdentityPort
}

// NewHandler builds the MCP HTTP layer.
func NewHandler(srv *Server, tokens *TokenStore, ident IdentityPort) *Handler {
	return &Handler{srv: srv, tokens: tokens, ident: ident}
}

// RPC handles POST /api/mcp.
//
// Authentication is the bearer token, resolved to a PERSON. Everything after
// that runs under their permissions — there is no separate MCP permission set
// to keep in sync.
func (h *Handler) RPC(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
	if secret == "" {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	userID, err := h.tokens.Resolve(r.Context(), secret)
	if err != nil {
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}
	id, err := h.ident.Claims(r.Context(), userID.String())
	if err != nil || id == nil {
		// The token is valid but the account behind it is gone or disabled.
		httpx.WriteError(w, apperr.Unauthorized("unauthorized"))
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody))
	if err != nil {
		httpx.WriteError(w, apperr.BadRequest("bad_request"))
		return
	}

	// Tools read the caller off the context, exactly as a console handler's
	// would — so there is no second notion of "who is calling" for MCP.
	res := h.srv.Handle(httpx.WithIdentity(r.Context(), id), id, body)
	// Always 200: JSON-RPC carries its own errors, and an HTTP status would
	// make a client retry a call that will fail the same way again.
	httpx.WriteJSON(w, http.StatusOK, res)
}

// --- credential management (console) ---

type issueRequest struct {
	Label string `json:"label" validate:"required,max=120"`
}

// Issue handles POST /api/mcp/tokens.
func (h *Handler) Issue(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok || !id.Has(permUse) {
		httpx.WriteError(w, apperr.AccessDenied("access_denied"))
		return
	}
	var req issueRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	out, err := h.tokens.Issue(r.Context(), id.UserID, req.Label)
	if err != nil {
		httpx.WriteError(w, apperr.Internal())
		return
	}
	// The only time the plaintext is ever returned. Say so in the shape of the
	// response rather than hoping the UI remembers.
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"token":      out.Token,
		"secret":     out.Secret,
		"shown_once": true,
	})
}

// List handles GET /api/mcp/tokens.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok || !id.Has(permUse) {
		httpx.WriteError(w, apperr.AccessDenied("access_denied"))
		return
	}
	rows, err := h.tokens.List(r.Context(), id.UserID)
	if err != nil {
		httpx.WriteError(w, apperr.Internal())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": rows})
}

// Revoke handles DELETE /api/mcp/tokens/{id}.
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.IdentityFromContext(r.Context())
	if !ok || !id.Has(permUse) {
		httpx.WriteError(w, apperr.AccessDenied("access_denied"))
		return
	}
	tokenID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	if err := h.tokens.Revoke(r.Context(), id.UserID, tokenID); err != nil {
		httpx.WriteError(w, apperr.NotFound("not_found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Register mounts the MCP endpoint and its credential routes.
//
// /api/mcp is deliberately OUTSIDE the console auth middleware: an MCP client
// presents its own long-lived token, not a session.
func Register(r chi.Router, h *Handler, authMW func(http.Handler) http.Handler) {
	r.Post("/api/mcp", h.RPC)

	r.Group(func(r chi.Router) {
		r.Use(authMW)
		r.Get("/api/mcp/tokens", h.List)
		r.Post("/api/mcp/tokens", h.Issue)
		r.Delete("/api/mcp/tokens/{id}", h.Revoke)
	})
}
