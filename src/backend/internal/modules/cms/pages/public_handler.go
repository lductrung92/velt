package pages

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// PublicHandler is the HTTP layer for the public page read.
type PublicHandler struct {
	svc *PublicService
}

// GetPage handles GET /api/public/cms/pages/{slug}.
func (h *PublicHandler) GetPage(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.GetPublishedPage(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// RegisterPublic mounts the public (no-auth) page read on the given router. The
// resolver turns each block's config into fresh data at read time; the landing
// port resolves the sections of a landing the page attaches.
func RegisterPublic(r chi.Router, pool *pgxpool.Pool, resolver *widgets.Resolver, landing LandingPort) {
	h := &PublicHandler{svc: NewPublicService(NewRepository(pool), resolver, landing)}
	r.Get("/pages/{slug}", h.GetPage)
}
