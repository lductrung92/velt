package users

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Register builds the users repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/admin router (users.* gates + safety
// constraints in the service). The per-user session routes are owned by the
// sessions sub-package.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/users", h.ListUsers)
	r.Post("/users", h.CreateUser)
	r.Get("/users/{id}", h.GetUser)
	r.Patch("/users/{id}", h.UpdateUser)
	r.Delete("/users/{id}", h.DeleteUser)
	r.Post("/users/{id}/roles", h.AssignRole)
	r.Delete("/users/{id}/roles/{role_id}", h.RemoveRole)
	r.Post("/users/{id}/reset-password", h.ResetPassword)
}
