package settings

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Handler is the HTTP layer for settings; it parses/writes HTTP and delegates
// all logic (incl. authorization) to the Service.
type Handler struct {
	svc *Service
}

// NewHandler builds the settings HTTP handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// GetAll handles GET /api/settings.
func (h *Handler) GetAll(w http.ResponseWriter, r *http.Request) {
	id, _ := httpx.IdentityFromContext(r.Context())
	view, err := h.svc.GetAll(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, view)
}

// Update handles PUT /api/settings.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	var req updateRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	id, _ := httpx.IdentityFromContext(r.Context())
	view, err := h.svc.Update(r.Context(), id, req.Updates)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, view)
}

// GetPublic handles GET /api/public/settings (no auth). The response is
// CDN/ISR-friendly: it carries an ETag + Cache-Control and supports conditional
// GET (304). Caching at the edge — not a per-IP limit — is the right abuse
// defense here, since the endpoint is read-only, public, and typically fronted
// by a CDN (a per-IP limit would penalize the shared CDN egress IP).
func (h *Handler) GetPublic(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.GetPublic(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	body, err := json.Marshal(out)
	if err != nil {
		httpx.WriteError(w, apperr.Internal())
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("ETag", etag)
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// TestEmail handles POST /api/settings/email/test.
func (h *Handler) TestEmail(w http.ResponseWriter, r *http.Request) {
	var req testEmailRequest
	if err := httpx.DecodeAndValidate(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	id, _ := httpx.IdentityFromContext(r.Context())
	if err := h.svc.TestEmail(r.Context(), id, req.To); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, okResponse{OK: true})
}

type okResponse struct {
	OK bool `json:"ok"`
}
