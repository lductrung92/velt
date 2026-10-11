// Package products is the products bounded context. It is a parent directory of
// self-contained feature sub-packages (categories, and the product catalog
// itself) plus their shared spine; this file performs wiring only.
package products

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/catalog"
	"github.com/velt/backend/internal/modules/products/categories"
	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/revalidate"
	"github.com/velt/backend/internal/platform/storage"
)

// Register builds every products feature and mounts its routes. Per-endpoint
// permission is enforced in the service layer, not here.
func Register(r chi.Router, pool *pgxpool.Pool, store *storage.Manager, settings catalog.SettingsPort,
	logger *slog.Logger, authMW func(http.Handler) http.Handler, rev revalidate.Revalidator,
) {
	base := shared.NewBase(logger)
	base.SetRevalidator(rev)

	categories.Register(r, categories.NewService(base, categories.NewRepository(pool)), authMW)
	catalog.Register(r, catalog.NewService(base, catalog.NewRepository(pool),
		catalog.NewLinksRepository(pool), store, store, settings), authMW)

	// The site reads the catalog through its own no-auth surface, which can only
	// ever see published snapshots.
	catalog.RegisterPublic(r, catalog.NewPublicService(base, catalog.NewPublicRepository(pool), store))
}
