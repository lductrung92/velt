package regions

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Register builds the regions repo/service/handler and mounts its routes on
// the already-grouped, auth-protected /api/cms router (read cms.page.view,
// write cms.menu.manage).
func Register(r chi.Router, base *shared.Base, pool *pgxpool.Pool) {
	h := NewHandler(NewService(base, NewRepository(pool)))
	r.Get("/regions", h.GetRegions)
	r.Put("/regions/{group}/{slot}/blocks", h.ReplaceRegionBlocks)
}
