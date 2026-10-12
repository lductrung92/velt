package pages

import (
	"errors"
	"net/http"
	"path"

	"github.com/go-chi/chi/v5"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// PublicHandler is the HTTP layer for the public page read.
type PublicHandler struct {
	svc *PublicService
}

// GetPage handles GET /api/public/cms/pages/{slug}.
//
// A retired slug, or another language's slug for the same page, comes back as
// ErrMoved and is answered with 301 — one page must not be reachable at two
// indexable URLs, and links already handed out have to keep working.
func (h *PublicHandler) GetPage(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetPublishedPage(r.Context(), r.URL.Query().Get("locale"), chi.URLParam(r, "slug"))
	var moved ErrMoved
	if errors.As(err, &moved) {
		http.Redirect(w, r, redirectTarget(r, moved.Slug), http.StatusMovedPermanently)
		return
	}
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// redirectTarget swaps the slug in the current path and keeps the query string,
// so ?locale= survives the redirect.
func redirectTarget(r *http.Request, slug string) string {
	u := *r.URL
	u.Path = path.Join(path.Dir(r.URL.Path), slug)
	return u.RequestURI()
}

// RegisterPublic mounts the public (no-auth) page read on the given router and
// returns the service, so wiring can hand it the language list. The resolver
// turns each block's config into fresh data at read time; the landing port
// resolves the sections of a landing the page attaches.
func RegisterPublic(r chi.Router, resolver *widgets.Resolver, landing LandingPort, docs *pubdocs.Store) *PublicService {
	svc := NewPublicService(NewPublicRepository(docs), resolver, landing)
	h := &PublicHandler{svc: svc}
	r.Get("/pages/{slug}", h.GetPage)
	return svc
}
