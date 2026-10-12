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
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/revalidate"
	"github.com/velt/backend/internal/platform/storage"
)

// Register builds every products feature and mounts its routes. Per-endpoint
// permission is enforced in the service layer, not here.
func Register(r chi.Router, pool *pgxpool.Pool, store *storage.Manager, settings catalog.SettingsPort,
	logger *slog.Logger, authMW func(http.Handler) http.Handler, rev revalidate.Revalidator,
	docs *pubdocs.Store,
) Wiring {
	base := shared.NewBase(logger)
	base.SetRevalidator(rev)

	cats := categories.NewService(base, categories.NewRepository(pool))
	categories.Register(r, cats, authMW)
	cat := catalog.NewService(base, catalog.NewRepository(pool),
		catalog.NewLinksRepository(pool), store, store, settings)
	catalog.Register(r, cat, authMW)
	cat.SetPublicDocs(docs)

	// The site reads the catalog through its own no-auth surface, which can only
	// ever see published documents.
	pub := catalog.NewPublicService(base, catalog.NewPublicRepository(pool, docs), store)
	catalog.RegisterPublic(r, pub)
	return Wiring{Catalog: cat, Categories: cats, PublicCatalog: pub}
}

// Wiring is what the products context hands back so the application can connect
// it to modules it must not import itself: the translation module, which has no
// permissions of its own and defers to the catalog's edit gate, and the AI
// assistant, which reads the catalog through the same published-only surface
// the site does rather than getting a second path to the data.
type Wiring struct {
	Catalog       *catalog.Service
	Categories    *categories.Service
	PublicCatalog *catalog.PublicService
}
