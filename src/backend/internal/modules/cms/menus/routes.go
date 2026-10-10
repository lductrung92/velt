package menus

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the menus repo/service/handler and mounts its routes on the
// already-grouped, auth-protected /api/cms router (gated cms.menu.manage).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/menus", h.GetMenus)
	r.Get("/menus/{id}", h.GetMenu)
	r.Post("/menus", h.CreateMenu)
	r.Patch("/menus/{id}", h.UpdateMenu)
	r.Delete("/menus/{id}", h.DeleteMenu)
	r.Put("/menus/{id}/items", h.ReplaceMenuItems)
}
