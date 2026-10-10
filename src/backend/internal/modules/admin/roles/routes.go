package roles

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Register builds the roles repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/admin router (roles.read/manage,
// permissions.read). Owns the read-only permission catalog too.
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/roles", h.ListRoles)
	r.Post("/roles", h.CreateRole)
	r.Get("/roles/{id}", h.GetRole)
	r.Get("/roles/{id}/members", h.ListRoleMembers)
	r.Patch("/roles/{id}", h.UpdateRole)
	r.Put("/roles/{id}/permissions", h.ReplaceRolePermissions)
	r.Delete("/roles/{id}", h.DeleteRole)

	r.Get("/permissions", h.ListPermissions)
}
