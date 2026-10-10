package newsletter

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the newsletter repo/service/handler and mounts its routes on
// the already-grouped, auth-protected /api/cms router (gated cms.newsletter.manage).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/newsletter/subscribers", h.GetNewsletterSubscribers)
	r.Delete("/newsletter/subscribers/{id}", h.DeleteNewsletterSubscriber)
}
