// Package files serves stored files over HTTP (e.g. avatars). Uploads live in
// the owning module (e.g. account avatar); this only reads back by path via the
// shared storage driver.
//
// SECURITY MODEL: this endpoint is UNAUTHENTICATED and serves only paths under
// an explicit public-prefix allowlist (e.g. "users/" for avatars). Those assets
// are public-by-design and carry a random suffix (unguessable URL). Private/
// owner-scoped files MUST NOT be placed under an allowlisted prefix — they need
// a separate authorized route (owner check / short-lived signed URL).
package files

import (
	"io"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/velt/backend/internal/platform/storage"
)

// Handler serves files from a Storage backend, limited to public prefixes.
type Handler struct {
	store          storage.Storage
	publicPrefixes []string
}

// NewHandler builds the file-serving handler. publicPrefixes is the allowlist of
// path prefixes that may be served (e.g. "users/").
func NewHandler(store storage.Storage, publicPrefixes []string) *Handler {
	return &Handler{store: store, publicPrefixes: publicPrefixes}
}

// Serve handles GET /api/files/*.
func (h *Handler) Serve(w http.ResponseWriter, r *http.Request) {
	p := chi.URLParam(r, "*")
	if p == "" || !h.isPublic(p) {
		http.NotFound(w, r)
		return
	}
	rc, err := h.store.Open(r.Context(), p)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer func() { _ = rc.Close() }()

	if ct := mime.TypeByExtension(strings.ToLower(path.Ext(p))); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// Uploads are magic-byte checked to four raster formats, so nothing active
	// should ever reach here. This is the second lock: if one ever did, it
	// executes nothing — and these files share an origin with the refresh
	// cookie, so "executes nothing" is worth stating twice.
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, rc)
}

// isPublic reports whether the path is under an allowlisted public prefix.
func (h *Handler) isPublic(p string) bool {
	for _, prefix := range h.publicPrefixes {
		if strings.HasPrefix(p, prefix) {
			return true
		}
	}
	return false
}

// RegisterRoutes mounts the public file-serving route.
func RegisterRoutes(r chi.Router, h *Handler) {
	r.Get("/api/files/*", h.Serve)
}
