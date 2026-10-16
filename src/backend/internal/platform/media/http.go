package media

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/platform/storage"
)

// Cache-Control values. The immutable year is honest for the two URLs that name
// an exact rendering: (slug, width, ext) can never mean different bytes, because
// replacing an image mints a new slug. The negotiating URL must NOT be immutable
// — it deliberately returns different bytes to different clients (design §4).
const (
	cacheImmutable  = "public, max-age=31536000, immutable"
	cacheNegotiated = "public, max-age=604800"
)

// Handler serves the public file and image routes.
type Handler struct {
	resolver *Resolver
	images   *Images
	store    storage.Storage
}

// NewHandler builds the serving handler over the `files` repository, the storage
// driver holding the originals, and the directory that holds rendered
// derivatives.
func NewHandler(repo Repository, store storage.Storage, cacheRoot string) *Handler {
	return &Handler{
		resolver: NewResolver(repo),
		images:   NewImages(store, cacheRoot),
		store:    store,
	}
}

// RegisterRoutes mounts the three public routes. They sit outside /api on
// purpose: /files belongs to the main host and /img is meant to be pointed at a
// cookie-less image subdomain, and neither should look like an API call.
func RegisterRoutes(r chi.Router, h *Handler) {
	// HEAD answers the same handler as GET: a CDN, an uptime check and a link
	// checker all ask that way, and chi — unlike net/http's own mux — does not
	// map HEAD onto a GET route by itself, so without this they get a 405 for a
	// file that is plainly there. The response writer drops the body for a HEAD
	// request, so the handler needs no branch of its own.
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		r.Method(method, "/files/{name}", http.HandlerFunc(h.ServeFile))
		r.Method(method, "/img/{name}", http.HandlerFunc(h.ServeImage))
		r.Method(method, "/img/{slug}/{name}", http.HandlerFunc(h.ServeSizedImage))
	}
}

// ServeFile handles GET /files/{slug}.{ext} — the original bytes, unmodified.
func (h *Handler) ServeFile(w http.ResponseWriter, r *http.Request) {
	slug, ext, ok := splitName(chi.URLParam(r, "name"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	rec, err := h.resolver.Resolve(r.Context(), slug)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	// The extension is part of the identity, not decoration: without this an
	// asset would answer on infinitely many URLs, each of them cached for a year.
	if ext != extOfKey(rec.StorageKey) {
		http.NotFound(w, r)
		return
	}
	setAssetHeaders(w, rec.MIME)
	w.Header().Set("Cache-Control", cacheImmutable)
	etag := `"` + rec.SHA256 + `"`
	w.Header().Set("ETag", etag)
	if matchesETag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	rc, err := h.store.Open(r.Context(), rec.StorageKey)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer func() { _ = rc.Close() }()
	w.Header().Set("Content-Length", strconv.FormatInt(rec.SizeBytes, 10))
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, rc)
}

// ServeImage handles GET /img/{slug}.{ext} — capped at the largest rendered
// width, in whichever format the client can read. The extension is the fallback
// for a client that did not ask for WebP; the body varies with Accept, so this
// is the one route that says so and the one that is not immutable.
func (h *Handler) ServeImage(w http.ResponseWriter, r *http.Request) {
	slug, ext, ok := splitName(chi.URLParam(r, "name"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	fallback, ok := formatForExt(ext)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Vary", "Accept")
	rec, err := h.resolver.Resolve(r.Context(), slug)
	if err != nil || !rec.IsImage() {
		http.NotFound(w, r)
		return
	}
	h.serveRecord(w, r, rec, negotiatedWidth(rec),
		Negotiate(r.Header.Get("Accept"), fallback), cacheNegotiated)
}

// ServeSizedImage handles GET /img/{slug}/{w}.{ext} — one exact rendering, named
// in full by its URL and therefore cacheable forever. No Accept negotiation
// here: the caller already chose, usually through a <picture> srcset.
func (h *Handler) ServeSizedImage(w http.ResponseWriter, r *http.Request) {
	name, ext, ok := splitName(chi.URLParam(r, "name"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	width, err := strconv.Atoi(name)
	if err != nil || !allowedWidth(width) {
		http.NotFound(w, r)
		return
	}
	format, ok := formatForExt(ext)
	if !ok {
		http.NotFound(w, r)
		return
	}
	rec, err := h.resolver.Resolve(r.Context(), chi.URLParam(r, "slug"))
	if err != nil || !rec.IsImage() {
		http.NotFound(w, r)
		return
	}
	h.serveRecord(w, r, rec, width, format, cacheImmutable)
}

// serveRecord is the shared body of both image routes: render (or read the
// cached rendering), answer a conditional request, send the bytes.
func (h *Handler) serveRecord(w http.ResponseWriter, r *http.Request, rec Record, width int, format Format, cacheControl string) {
	setAssetHeaders(w, format.contentType())
	w.Header().Set("Cache-Control", cacheControl)
	// The ETag names the rendering, not the original: the same source answers
	// /640.webp and /640.jpg with different bytes, and a shared ETag would let a
	// cache serve one as the other.
	etag := `"` + rec.SHA256 + "-" + strconv.Itoa(width) + "-" + format.ext() + `"`
	w.Header().Set("ETag", etag)
	if matchesETag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	data, cached, err := h.images.Derivative(r.Context(), rec, width, format)
	if err != nil {
		if errors.Is(err, ErrTooLarge) || errors.Is(err, ErrUnsupported) || errors.Is(err, ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "render failed", http.StatusInternalServerError)
		return
	}
	// Says whether this response cost an encode. It is the only way to tell a
	// warm derivative from a cold one from outside the process.
	w.Header().Set("X-Media-Cache", cacheState(cached))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func cacheState(cached bool) string {
	if cached {
		return "hit"
	}
	return "miss"
}

// setAssetHeaders writes the headers every served asset carries. Uploads are
// magic-byte checked to four raster formats, so nothing active should ever get
// here; this is the second lock, and these bytes may share an origin with the
// refresh cookie, so "executes nothing" is worth stating twice.
func setAssetHeaders(w http.ResponseWriter, contentType string) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
}

// splitName splits "<base>.<ext>" on the LAST dot. A name with no extension is
// rejected rather than guessed at.
func splitName(name string) (base, ext string, ok bool) {
	i := strings.LastIndex(name, ".")
	if i <= 0 || i == len(name)-1 {
		return "", "", false
	}
	return name[:i], strings.ToLower(name[i+1:]), true
}

// matchesETag reports whether an If-None-Match header covers the tag. "*" matches
// anything, and the weak prefix is ignored because these ETags compare only for
// cache revalidation, which is a weak comparison by definition.
func matchesETag(header, etag string) bool {
	if header == "" {
		return false
	}
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}
