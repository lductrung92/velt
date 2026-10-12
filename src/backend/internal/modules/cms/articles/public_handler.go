package articles

import (
	"errors"
	"net/http"
	"path"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/storage"
)

// PublicHandler is the HTTP layer for the public (no-auth) blog read.
type PublicHandler struct {
	svc *PublicService
}

// ListArticles handles GET /api/public/cms/articles (q, sort, page, page_size).
func (h *PublicHandler) ListArticles(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	res, err := h.svc.ListPublished(r.Context(),
		q.Get("locale"), q.Get("q"), q.Get("sort"),
		shared.QueryInt(r, "page", 1), shared.QueryInt(r, "page_size", 0))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetArticle handles GET /api/public/cms/articles/{slug}.
//
// A retired slug, or another language's slug for the same article, comes back as
// ErrMoved and is answered with 301 — one piece of content must not be reachable
// at two indexable URLs, and links already handed out have to keep working.
func (h *PublicHandler) GetArticle(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetBySlug(r.Context(), r.URL.Query().Get("locale"), chi.URLParam(r, "slug"))
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

// RegisterPublic mounts the public (no-auth) blog read on the given router and
// returns the service, so wiring can hand it the language list.
func RegisterPublic(r chi.Router, pool *pgxpool.Pool, store storage.Storage, docs *pubdocs.Store) *PublicService {
	svc := NewPublicService(NewPublicRepository(pool, docs), store)
	h := &PublicHandler{svc: svc}
	r.Get("/articles", h.ListArticles)
	r.Get("/articles/{slug}", h.GetArticle)
	return svc
}
