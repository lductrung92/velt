package catalog

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// PublicHandler is the HTTP layer for the no-auth catalog read.
type PublicHandler struct {
	svc *PublicService
}

// NewPublicHandler builds the public catalog handler.
func NewPublicHandler(svc *PublicService) *PublicHandler {
	return &PublicHandler{svc: svc}
}

// publicListParams reads the query string. There is no `status` parameter on
// purpose — see PublicListParams.
func publicListParams(r *http.Request) PublicListParams {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("page_size"))
	var featured *bool
	if v := q.Get("featured"); v == "true" || v == "false" {
		b := v == "true"
		featured = &b
	}
	return PublicListParams{
		Query:     strings.TrimSpace(q.Get("q")),
		Category:  q.Get("category"),
		Lifecycle: q.Get("lifecycle"),
		Audience:  q.Get("audience"),
		Platform:  q.Get("platform"),
		Featured:  featured,
		Sort:      q.Get("sort"),
		Page:      page,
		PageSize:  size,
	}
}

// writeCached serializes the payload with an ETag and a short max-age, and
// answers 304 when the client already has that exact body.
//
// Caching at the edge — not a per-IP limit — is the right defense for these
// endpoints: they are read-only and public, and a per-IP limit would punish the
// shared egress IP of a CDN. Same reasoning as /api/public/settings.
func writeCached(w http.ResponseWriter, r *http.Request, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		httpx.WriteError(w, apperr.Internal())
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// ListProducts handles GET /api/public/products.
func (h *PublicHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.List(r.Context(), publicListParams(r))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeCached(w, r, res)
}

// GetProduct handles GET /api/public/products/{slug}.
func (h *PublicHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeCached(w, r, res)
}

// ListCategories handles GET /api/public/product-categories.
func (h *PublicHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.Categories(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	writeCached(w, r, res)
}

// RegisterPublic mounts the no-auth catalog read.
func RegisterPublic(r chi.Router, svc *PublicService) {
	h := NewPublicHandler(svc)
	r.Get("/api/public/products", h.ListProducts)
	r.Get("/api/public/products/{slug}", h.GetProduct)
	r.Get("/api/public/product-categories", h.ListCategories)
}
