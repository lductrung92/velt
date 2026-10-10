package taxonomy

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the taxonomy repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (read: cms.article.view ·
// write: cms.taxonomy.manage).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
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
}
