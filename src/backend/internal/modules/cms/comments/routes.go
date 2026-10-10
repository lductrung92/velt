package comments

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the comments repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (gated cms.comment.moderate).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/comments", h.GetComments)
	r.Patch("/comments/{id}", h.UpdateComment)
	r.Delete("/comments/{id}", h.DeleteComment)
}
