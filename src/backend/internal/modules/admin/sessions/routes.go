package sessions

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Register builds the sessions repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/admin router (gated sessions.read/revoke).
// Owns the per-user session routes too (session operations scoped to a user).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/sessions", h.ListSessions)
	r.Delete("/sessions/{id}", h.RevokeSession)
	r.Post("/sessions/purge", h.PurgeSessions)
	r.Get("/users/{id}/sessions", h.GetUserSessions)
	r.Delete("/users/{id}/sessions", h.RevokeUserSessions)
}
