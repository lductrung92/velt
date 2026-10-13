// Package cms is the CMS bounded context. It is a parent directory of
// self-contained feature sub-packages (articles, taxonomy, pages, menus, landing,
// comments, newsletter, settings), each with its own Handler/Service/Repository;
// the cross-feature spine lives in cms/shared. This root holds only the single
// wiring entry point (Register) and the settings-registry definitions.
package cms

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/articles"
	"github.com/velt/backend/internal/modules/cms/comments"
	"github.com/velt/backend/internal/modules/cms/landing"
	"github.com/velt/backend/internal/modules/cms/menus"
	"github.com/velt/backend/internal/modules/cms/newsletter"
	"github.com/velt/backend/internal/modules/cms/pages"
	cmssettings "github.com/velt/backend/internal/modules/cms/settings"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/taxonomy"
	"github.com/velt/backend/internal/modules/cms/widgets"
	settingssvc "github.com/velt/backend/internal/modules/settings"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/revalidate"
	"github.com/velt/backend/internal/platform/storage"
)

// Register mounts the full CMS admin surface under /api/cms — all gated by authMW;
// per-endpoint permissions are enforced in each feature's service layer. It is the
// single wiring entry point for the bounded context: each feature sub-package
// registers its own routes on the shared group.
func Register(r chi.Router, pool *pgxpool.Pool, settings shared.SettingsPort, store storage.Storage, log *slog.Logger, authMW func(http.Handler) http.Handler, ports widgets.Ports, rev revalidate.Revalidator, limiter ratelimit.Limiter, trustProxy bool, docs *pubdocs.Store) Wiring {
	base := shared.NewBase(settings, log)
	base.SetRevalidator(rev)
	var w Wiring
	w.Base = base

	// Public (no-auth) read surface — published content with widgets resolved.
	resolver := widgets.NewResolver(ports)
	// A page may attach a landing; its published sections resolve in-process.
	landingPublic := landing.NewPublicService(landing.NewRepository(pool), resolver, store)
	r.Route("/api/public/cms", func(r chi.Router) {
		// A token that moves on every publish. The public site polls it and
		// drops its cache when it changes, so an edit is visible immediately
		// instead of after the cache TTL — without the backend having to know
		// that a cache exists, or where.
		r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
			token, err := docs.Version(r.Context())
			if err != nil {
				httpx.WriteError(w, err)
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]string{"version": token})
		})
		w.PublicPages = pages.RegisterPublic(r, resolver, landingPublic, docs)
		w.PublicArticles = articles.RegisterPublic(r, pool, store, docs)
		newsletter.RegisterPublic(r, base, pool, limiter, trustProxy)
		menus.RegisterPublic(r, pool)
	})

	r.Route("/api/cms", func(r chi.Router) {
		r.Use(authMW)
		widgets.RegisterPreview(r, base, resolver)
		w.Taxonomy = taxonomy.Register(r, base, pool)
		w.Pages = pages.Register(r, base, pool, landing.NewPagesPort(landing.NewRepository(pool), store))
		w.Articles = articles.Register(r, base, pool, store)
		w.Menus = menus.Register(r, base, pool)
		landing.Register(r, base, pool, store)
		comments.Register(r, base, pool)
		newsletter.Register(r, base, pool)
		w.Settings = cmssettings.Register(r, base, settings)
	})

	w.Articles.SetPublicDocs(docs)
	w.Pages.SetPublicDocs(docs)
	return w
}

// Wiring is what the CMS hands back so the application can connect it to modules
// it must not import itself — translation being the one that matters: the CMS
// owns the author-only rule, and the translation module must defer to it.
type Wiring struct {
	// Base is the spine every CMS feature shares. It is handed back so the
	// application can wire the activity recorder onto all of them at once.
	Base           *shared.Base
	Articles       *articles.Service
	PublicArticles *articles.PublicService
	Pages          *pages.Service
	PublicPages    *pages.PublicService
	Taxonomy       *taxonomy.Service
	// Menus and Settings are handed back for one reason each: both gate a
	// translation route (a menu item's label, the site chrome's copy).
	Menus    *menus.Service
	Settings *cmssettings.Service
}

// SettingDefs returns the CMS feature-flag definitions for the settings registry
// (called from main wiring). Delegates to cms/shared.
func SettingDefs() []settingssvc.SettingDef { return shared.SettingDefs() }
