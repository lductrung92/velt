package taxonomy

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the taxonomy repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (read: cms.article.view ·
// write: cms.taxonomy.manage).
//
// It returns the service so wiring can hand it the translation port and borrow
// its permission gate for the translation endpoints.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) *Service {
	svc := NewService(base, NewRepository(pool))
	h := NewHandler(svc)
	r.Get("/categories", h.ListCategories)
	r.Post("/categories", h.CreateCategory)
	r.Patch("/categories/{id}", h.UpdateCategory)
	r.Delete("/categories/{id}", h.DeleteCategory)

	r.Get("/tags", h.ListTags)
	r.Get("/tags/options", h.ListTagOptions)
	r.Post("/tags", h.CreateTag)
	r.Patch("/tags/{id}", h.UpdateTag)
	r.Delete("/tags/{id}", h.DeleteTag)
	r.Post("/tags/merge", h.MergeTags)
	return svc
}
