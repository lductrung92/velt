package pages

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the pages repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (gated cms.page.*).
// It returns the service so wiring can hand it the public read model and the
// translation port — two things this package must not import for itself.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool, landing LandingAdminPort) *Service {
	svc := NewService(base, NewRepository(pool), landing)
	h := NewHandler(svc)
	r.Get("/pages", h.GetPages)
	r.Get("/pages/options", h.GetPageOptions)
	r.Get("/pages/{id}", h.GetPage)
	r.Post("/pages", h.CreatePage)
	r.Patch("/pages/{id}", h.UpdatePage)
	r.Delete("/pages/{id}", h.DeletePage)
	r.Post("/pages/{id}/publish", h.PublishPage)
	r.Post("/pages/{id}/unpublish", h.UnpublishPage)
	return svc
}
