package pages

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the pages repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (gated cms.page.*).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool, landing LandingAdminPort) {
	repo := NewRepository(pool)
	h := NewHandler(NewService(base, repo, landing))
	r.Get("/pages", h.GetPages)
	r.Get("/pages/{id}", h.GetPage)
	r.Post("/pages", h.CreatePage)
	r.Patch("/pages/{id}", h.UpdatePage)
	r.Delete("/pages/{id}", h.DeletePage)
	r.Post("/pages/{id}/publish", h.PublishPage)
	r.Post("/pages/{id}/unpublish", h.UnpublishPage)
}
