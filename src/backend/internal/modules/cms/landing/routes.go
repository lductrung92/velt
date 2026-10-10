package landing

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/storage"
)

// Register builds the landing repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (gated cms.landing.manage).
// Section PATCH/DELETE live under /landing/sections/{id} so the static segment
// never collides with /landing/{id}.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool, store storage.Storage) {
	h := NewHandler(NewService(base, NewRepository(pool), store))
	r.Get("/landing", h.GetLandings)
	r.Post("/landing", h.CreateLanding)
	r.Patch("/landing/sections/{id}", h.UpdateSection)
	r.Delete("/landing/sections/{id}", h.DeleteSection)
	r.Get("/landing/{id}", h.GetLanding)
	r.Patch("/landing/{id}", h.UpdateLanding)
	r.Delete("/landing/{id}", h.DeleteLanding)
	r.Post("/landing/{id}/sections", h.CreateSection)
	r.Post("/landing/{id}/upload", h.UploadMedia)
	r.Put("/landing/{id}/sections/order", h.ReorderSections)
	r.Post("/landing/{id}/publish", h.PublishLanding)
	r.Post("/landing/{id}/unpublish", h.UnpublishLanding)
}
