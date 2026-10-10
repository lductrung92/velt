package articles

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
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
		q.Get("q"), q.Get("sort"),
		shared.QueryInt(r, "page", 1), shared.QueryInt(r, "page_size", 0))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// GetArticle handles GET /api/public/cms/articles/{slug}.
func (h *PublicHandler) GetArticle(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// RegisterPublic mounts the public (no-auth) blog read on the given router.
func RegisterPublic(r chi.Router, pool *pgxpool.Pool, store storage.Storage) {
	h := &PublicHandler{svc: NewPublicService(NewPublicRepository(pool), store)}
	r.Get("/articles", h.ListArticles)
	r.Get("/articles/{slug}", h.GetArticle)
}
