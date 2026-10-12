package articles

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/storage"
)

// Register builds the articles repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (status-field workflow; editor
// ABAC own-only).
// It returns the service so wiring can hand it the public read model and the
// translation port — two things this package must not import for itself.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool, store storage.Storage) *Service {
	svc := NewService(base, NewRepository(pool), store)
	h := NewHandler(svc)
	r.Get("/articles", h.GetArticles)
	r.Get("/articles/{id}", h.GetArticle)
	r.Post("/articles", h.CreateArticle)
	r.Patch("/articles/{id}", h.UpdateArticle)
	r.Delete("/articles/{id}", h.DeleteArticle)
	r.Post("/articles/{id}/upload", h.UploadArticleMedia)
	return svc
}
