// Command api is the HTTP entrypoint. It performs wiring only — no business
// logic. Middleware order: correlation-id → logging → recover → (auth per
// route) → handler.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/account"
	activityread "github.com/velt/backend/internal/modules/activity"
	"github.com/velt/backend/internal/modules/admin"
	"github.com/velt/backend/internal/modules/ai"
	aitools "github.com/velt/backend/internal/modules/ai/tools"
	"github.com/velt/backend/internal/modules/auth"
	"github.com/velt/backend/internal/modules/cms"
	cmsarticles "github.com/velt/backend/internal/modules/cms/articles"
	cmstaxonomy "github.com/velt/backend/internal/modules/cms/taxonomy"
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/modules/crm"
	"github.com/velt/backend/internal/modules/crm/leads"
	"github.com/velt/backend/internal/modules/files"
	"github.com/velt/backend/internal/modules/members"
	"github.com/velt/backend/internal/modules/products"
	"github.com/velt/backend/internal/modules/products/catalog"
	"github.com/velt/backend/internal/modules/settings"
	"github.com/velt/backend/internal/modules/translation"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/internal/platform/mail"
	"github.com/velt/backend/internal/platform/media"
	"github.com/velt/backend/internal/platform/pubdocs"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/recaptcha"
	"github.com/velt/backend/internal/platform/revalidate"
	"github.com/velt/backend/internal/platform/storage"
	"github.com/velt/backend/internal/platform/token"
	"github.com/velt/backend/migrations"
)

const (
	// maxRequestBytes is the global request-body cap (defense-in-depth). Upload
	// handlers set their own stricter inner caps via MaxBytesReader; this is the
	// outer default so a handler that forgets to cap can't exhaust memory.
	maxRequestBytes = 16 << 20 // 16 MiB
	// requestTimeout cancels r.Context() so a slow DB/SMTP/storage call is aborted
	// (WriteTimeout closes the socket but does not cancel the handler). Kept below
	// the server WriteTimeout so cancellation fires first.
	requestTimeout = 30 * time.Second
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// timeoutExceptStreams applies the request timeout to everything but SSE
// endpoints. Those are long-lived on purpose, so a deadline there is not a
// safety net — it is a guaranteed disconnect, and the visitor loses the answer
// the assistant is still writing.
func timeoutExceptStreams(d time.Duration) func(http.Handler) http.Handler {
	timed := chimw.Timeout(d)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "/stream") {
				next.ServeHTTP(w, r)
				return
			}
			timed(next).ServeHTTP(w, r)
		})
	}
}

func run() error {
	// Optional .env for local dev; real environment variables take precedence.
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if err := cfg.Validate(); err != nil {
		return err
	}

	logger := httpx.NewLogger(cfg.LogLevel, cfg.LogFile)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Subcommand: `api migrate` runs migrations and exits.
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := db.Migrate(cfg.DatabaseURL, migrations.FS); err != nil {
			return err
		}
		logger.Info("migrations applied")
		return nil
	}

	// Apply pending migrations on startup (idempotent).
	if err := db.Migrate(cfg.DatabaseURL, migrations.FS); err != nil {
		return err
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	keyBytes, err := crypto.ParseKey(cfg.EncryptionKey)
	if err != nil {
		return err
	}
	aead, err := crypto.NewAEAD(keyBytes)
	if err != nil {
		return err
	}

	tokens := token.NewManager(cfg.JWTSecret, cfg.AccessTokenTTL, cfg.ChallengeTokenTTL, time.Now)
	rdb := buildRedis(ctx, cfg, logger)
	if rdb != nil {
		defer func() { _ = rdb.Close() }()
	}
	limiter := buildLimiter(rdb, logger)
	settingsCache := buildSettingsCache(rdb, logger)

	// settings module (built first — the mailer reads SMTP config from it). The
	// registry is the foundation defs plus each business module's flags (cms.*).
	settingsDefs := append(settings.FoundationDefs(), cms.SettingDefs()...)
	settingsDefs = append(settingsDefs, ai.SettingDefs()...)
	settingsDefs = append(settingsDefs, translation.SettingDefs()...)
	settingsRegistry := settings.NewRegistry(settingsDefs...)
	settingsSvc := settings.NewService(settings.NewRepository(pool), settingsCache, aead,
		settingsRegistry, limiter, mail.NewSMTPTester(), settings.Options{Logger: logger})
	settingsHandler := settings.NewHandler(settingsSvc)

	// Storage: a settings-aware Manager that picks local vs S3 (SeaweedFS) per
	// the storage.driver setting at runtime, and builds avatar/file URLs to
	// match (local → /api/files, s3 → <endpoint>/<bucket>/<key>).
	store := storage.NewManager(storage.NewLocal(cfg.StorageLocalRoot), settingsSvc)

	// Transactional mailer: SMTP config resolved per-send from the settings
	// registry (admin-configurable at runtime); falls back to logging the link
	// when SMTP is unconfigured. From-address defaults to MAIL_FROM if unset.
	mailer := mail.NewSMTPMailer(func(c context.Context) mail.SMTPConfig {
		from := settingsSvc.GetString(c, "mail.from_address")
		if from == "" {
			from = cfg.MailFrom
		}
		return mail.SMTPConfig{
			Host:     settingsSvc.GetString(c, "mail.smtp_host"),
			Port:     settingsSvc.GetInt(c, "mail.smtp_port"),
			Username: settingsSvc.GetString(c, "mail.smtp_user"),
			Password: settingsSvc.GetSecret(c, "mail.smtp_password"),
			From:     from,
		}
	}, logger, !cfg.IsProd())

	// auth module
	authSvc := auth.NewService(auth.NewRepository(pool), tokens, limiter, mailer, aead, store, auth.Options{
		AccessTTL:       cfg.AccessTokenTTL,
		RefreshTTL:      cfg.RefreshTokenTTL,
		ResetTTL:        cfg.ResetTokenTTL,
		MaxFailedLogins: cfg.MaxFailedLogins,
		LockoutBase:     cfg.LockoutBase,
		SessionCap:      cfg.SessionCap,
		AppBaseURL:      cfg.AppBaseURL,
		Logger:          logger,
	})
	authHandler := auth.NewHandler(authSvc, cfg.CookieSecure, cfg.CookieDomain, cfg.TrustProxyHeaders)

	// account module + file serving (store built above, after settings)
	accountSvc := account.NewService(account.NewRepository(pool), tokens, aead, limiter, store, settingsSvc, account.Options{
		AccessTTL:  cfg.AccessTokenTTL,
		RefreshTTL: cfg.RefreshTokenTTL,
		Logger:     logger,
	})
	accountHandler := account.NewHandler(accountSvc, cfg.CookieSecure, cfg.CookieDomain, cfg.TrustProxyHeaders)
	// Public-by-design assets: avatars (users/) + CMS article media (cms/). Threat
	// model (intentional): ALL article media is public-on-upload regardless of the
	// article's status — draft/scheduled images are reachable by URL too. There is
	// no per-article authorization or published-state gate on serving; the only
	// protection is the random uuid suffix in the key (unguessable). Accepted
	// because article media is authored to be public content; if owner-scoped draft
	// media is ever required, serve cms/articles/ behind an authorized route /
	// signed URL that re-checks article ABAC + published state.
	filesHandler := files.NewHandler(store, []string{"users/", "cms/", "members/", "products/"})

	r := chi.NewRouter()
	r.Use(
		httpx.SecurityHeaders(cfg.IsProd()),
		chimw.RequestSize(maxRequestBytes),
		httpx.CORS(cfg.CORSAllowedOrigins),
		httpx.CorrelationID,
		httpx.ClientIPContext(cfg.TrustProxyHeaders),
		httpx.RequestLogger,
		httpx.Recoverer,
		timeoutExceptStreams(requestTimeout),
	)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	authMW := httpx.Authenticator(tokens)
	auth.RegisterRoutes(r, authHandler, authMW)
	settings.RegisterRoutes(r, settingsHandler, authMW)
	account.RegisterRoutes(r, accountHandler, authMW)
	// admin bounded context (users + roles + sessions; authSvc satisfies the
	// password-reset port for set-password / trigger-reset).
	adminBase := admin.Register(r, pool, authSvc, limiter, store, logger, authMW)
	// members bounded context: the public team roster the site shows and
	// products attach to. Separate from users (login identity) by design.
	membersSvc := members.Register(r, pool, store, settingsSvc, logger, authMW)
	// crm bounded context: leads only for now. The returned service is what the
	// AI assistant will use to record a lead in-process, so it never needs an
	// unauthenticated HTTP write.
	crmLeads := crm.Register(r, pool, logger, authMW)

	// The site's contact form: the second unauthenticated way a lead is
	// created, after the assistant. reCAPTCHA is configured in the console and
	// off by default, so the per-IP ceiling in the handler is what holds until
	// somebody turns it on.
	leads.RegisterPublic(r, leads.NewPublicHandler(
		crmLeads,
		recaptcha.NewVerifier(settingsSvc),
		limiter,
		cfg.TrustProxyHeaders,
		func(ctx context.Context, slug string) (*uuid.UUID, error) {
			m, err := membersSvc.GetPublicBySlug(ctx, "", slug)
			if err != nil {
				return nil, err
			}
			return &m.ID, nil
		},
	))
	// The public read model: one row per published URL, shared by every content
	// type. It replaces the per-table published_snapshot column and is what makes
	// a second language a row rather than a schema change.
	publicDocs := pubdocs.New(pool)
	// The activity log. Best-effort by design: a failed write warns, it never
	// fails the action it describes (internal/platform/activity).
	acts := activity.New(pool, logger)
	// products bounded context: the catalog VELT sells, plus its own taxonomy.
	productsWiring := products.Register(r, pool, store, settingsSvc, logger, authMW,
		revalidate.NewHTTP(cfg.CustomerWebBaseURL, cfg.RevalidateSecret, logger), publicDocs)
	// ai bounded context: the site assistant. It reads the catalog through the
	// SAME public service the site uses (published snapshots only) and the
	// public member roster — no second path to the data with its own rules.
	notifySvc := ai.Register(r, pool, settingsSvc, logger, authMW, ai.Deps{
		Catalog: productsWiring.PublicCatalog,
		Leads:   crmLeads,
		// Push services want somebody to contact if a sender misbehaves; the
		// address we already send mail from is that somebody.
		NotifySubject: "mailto:" + cfg.MailFrom,
		Roster: func(ctx context.Context) ([]aitools.Person, error) {
			res, err := membersSvc.ListPublic(ctx, members.ListParams{PageSize: 100})
			if err != nil {
				return nil, err
			}
			out := make([]aitools.Person, 0, len(res.Items))
			for _, m := range res.Items {
				role := ""
				if m.Role != nil {
					role = *m.Role
				}
				// DisplayName, not FullName: ListPublic has already dropped
				// the real name, and this roster is what the assistant reads
				// out to a visitor.
				out = append(out, aitools.Person{
					Slug: m.Slug, FullName: m.DisplayName, Role: role, Skills: m.Skills,
				})
			}
			return out, nil
		},
	}, cfg.CookieSecure, limiter, cfg.TrustProxyHeaders, aead)
	// cms bounded context (taxonomy + feature-flag settings + articles/pages/menus/
	// landing/comments/newsletter); settingsSvc is the scoped reader/writer for the
	// cms.* registry keys (CMS gates cms.settings.* itself).
	// Data readers for CMS widget resolvers, each adapted to a narrow widgets port
	// (articles_list / categories_showcase). Stateless over the pool.
	cmsWiring := cms.Register(r, pool, settingsSvc, store, logger, authMW, widgets.Ports{
		Articles:   cmsArticlesPort{cmsarticles.NewPublicRepository(pool, publicDocs)},
		Categories: cmsCategoriesPort{cmstaxonomy.NewPublicRepository(pool)},
		// A landing's product grid and team roster read the SAME published
		// services the public site reads directly, so a section and the page it
		// sits next to can never disagree about what is published.
		Products: cmsProductsPort{productsWiring.PublicCatalog},
		Members:  cmsMembersPort{membersSvc},
	}, revalidate.NewHTTP(cfg.CustomerWebBaseURL, cfg.RevalidateSecret, logger), limiter, cfg.TrustProxyHeaders, publicDocs)

	// Translation has no permissions of its own: every write defers to the gate of
	// the module that owns the content, so the CMS author-only rule covers an
	// article's translations exactly as it covers the article.
	// One arm per declared entity, each deferring to the gate of the module that
	// owns the content. An entity with no arm here is unreachable rather than
	// unguarded, which is why the default is 404 and not 403.
	translationSvc := translation.Register(r, pool, settingsSvc, authMW,
		func(ctx context.Context, id *httpx.Identity, entity string, entityID uuid.UUID) error {
			switch entity {
			case translation.EntityArticle:
				return cmsWiring.Articles.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityPage:
				return cmsWiring.Pages.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityCMSCategory:
				return cmsWiring.Taxonomy.AuthorizeTranslateCategory(ctx, id, entityID)
			case translation.EntityProduct:
				return productsWiring.Catalog.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityProductCategory:
				return productsWiring.Categories.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityMember:
				return membersSvc.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityMenuItem:
				return cmsWiring.Menus.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityLandingSection:
				return cmsWiring.Landing.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntityRegionBlock:
				return cmsWiring.Regions.AuthorizeTranslate(ctx, id, entityID)
			case translation.EntitySiteChrome:
				return cmsWiring.Settings.AuthorizeTranslate(ctx, id, entityID)
			}
			return apperr.NotFound("not_found")
		})
	// A landing section's text is translated too: the admin side gates the
	// write, the public side overlays it onto what was published.
	cmsWiring.Landing.SetTranslator(translationSvc)
	cmsWiring.PublicLanding.SetTranslator(translationSvc)
	// A chrome block's text travels the same way: the write side only clears the
	// copy of a block somebody removed, the public read overlays the rest.
	cmsWiring.Regions.SetTranslator(translationSvc)
	cmsWiring.PublicRegions.SetTranslator(translationSvc)

	// The public settings read serves the site's header and footer copy, so it
	// has to be able to answer in the language being read.
	settingsSvc.SetTranslatedText(translationSvc)

	// One recorder per bounded context: every feature inside it shares the same
	// spine, so this is the whole write side of the activity log.
	adminBase.SetActivity(acts)
	cmsWiring.Base.SetActivity(acts)
	productsWiring.Base.SetActivity(acts)
	membersSvc.SetActivity(acts)
	crmLeads.SetActivity(acts)
	// One duty roster, one set of registered browsers: the notifier built
	// for the chat also rings for a lead and for a newsletter sign-up.
	crmLeads.SetNotifier(notifySvc)
	cmsWiring.Newsletter.SetNotifier(notifySvc)
	authSvc.SetRecorder(acts)
	accountSvc.SetRecorder(acts)
	settingsSvc.SetRecorder(acts)

	// The read side: GET /api/activity and /api/activity/actions, gated by
	// activity.read. It never writes the table.
	activityread.Register(r, activityread.NewService(
		activityread.NewRepository(pool),
		activityread.Options{Logger: logger},
	), authMW)

	cmsWiring.Articles.SetTranslator(translationSvc)
	cmsWiring.PublicArticles.SetLocales(translationSvc)
	cmsWiring.Pages.SetTranslator(translationSvc)
	cmsWiring.PublicPages.SetLocales(translationSvc)
	cmsWiring.Taxonomy.SetTranslator(translationSvc)
	cmsWiring.Menus.SetTranslator(translationSvc)
	productsWiring.Catalog.SetTranslator(translationSvc)
	productsWiring.PublicCatalog.SetLocales(translationSvc)
	productsWiring.Categories.SetTranslator(translationSvc)
	membersSvc.SetTranslator(translationSvc)
	// Public asset serving (avatars + CMS article media) when the storage driver
	// is local; the S3 driver serves them straight from the bucket endpoint.
	// This is the LEGACY shape, /api/files/<storage key>, and it stays: the URLs
	// inside already-published body_html are of this shape.
	files.RegisterRoutes(r, filesHandler)
	// The flat public URLs: /files/{slug}.{ext} and /img/{slug}[/{w}].{ext}.
	// Same binary, two base URLs — in production /img is meant to answer on a
	// cookie-less image subdomain (internal/platform/media).
	mediaStore := media.NewStore(pool, media.URLs{
		FilesBase: cfg.MediaFilesBaseURL,
		ImageBase: cfg.MediaImageBaseURL,
	}, logger)
	media.RegisterRoutes(r, media.NewHandler(mediaStore, store, cfg.MediaCacheRoot))
	// The write side: every upload path that produces a public asset mints a row
	// here, so the slug exists before the URL it is handed back in is rendered —
	// and every delete path forgets it again, row and rendered derivatives both.
	mediaKeep := media.NewKeep(mediaStore, cfg.MediaCacheRoot)
	cmsWiring.Base.SetMedia(mediaKeep)
	productsWiring.Base.SetMedia(mediaKeep)
	membersSvc.SetMedia(mediaKeep)
	accountSvc.SetMedia(mediaKeep)
	cmsWiring.LandingPagesPort.SetMediaForget(mediaKeep)
	// The public READ side: every stored column still holds a storage key, so
	// each public response looks its images up here and answers with the flat
	// /img URL plus the intrinsic size the site needs to reserve space. Only the
	// PUBLIC services get it — the console reads the same storage keys and must
	// keep seeing the URLs it already knows.
	mediaPublic := media.NewPublicURLs(mediaStore, media.URLs{
		FilesBase: cfg.MediaFilesBaseURL,
		ImageBase: cfg.MediaImageBaseURL,
	}, store)
	cmsWiring.PublicArticles.SetMediaURLs(mediaPublic)
	cmsWiring.PublicLanding.SetMediaURLs(mediaPublic)
	productsWiring.PublicCatalog.SetMediaURLs(mediaPublic)
	membersSvc.SetMediaURLs(mediaPublic)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("http server listening", "addr", cfg.HTTPAddr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// buildRedis returns a connected Redis client when REDIS_URL is configured and
// reachable, otherwise nil (callers fall back to in-memory implementations).
func buildRedis(ctx context.Context, cfg config.Config, logger *slog.Logger) *redis.Client {
	if cfg.RedisURL == "" {
		return nil
	}
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Warn("redis: invalid REDIS_URL, using in-memory fallbacks", "err", err)
		return nil
	}
	rdb := redis.NewClient(opt)
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := rdb.Ping(pingCtx).Err(); err != nil {
		logger.Warn("redis: unreachable, using in-memory fallbacks", "err", err)
		_ = rdb.Close()
		return nil
	}
	return rdb
}

// buildLimiter returns a Redis-backed limiter when Redis is available, else an
// in-memory limiter (correct for a single instance).
func buildLimiter(rdb *redis.Client, logger *slog.Logger) ratelimit.Limiter {
	if rdb == nil {
		logger.Info("rate limiter: in-memory (single instance)")
		return ratelimit.NewMemoryLimiter(time.Now)
	}
	logger.Info("rate limiter: Redis")
	return ratelimit.NewRedisLimiter(rdb)
}

// buildSettingsCache returns a Redis-backed settings cache when Redis is
// available, else a no-op cache (reads always hit the DB).
func buildSettingsCache(rdb *redis.Client, logger *slog.Logger) settings.Cache {
	if rdb == nil {
		logger.Info("settings cache: disabled (no Redis)")
		return settings.NoopCache{}
	}
	logger.Info("settings cache: Redis")
	return settings.NewRedisCache(rdb, 5*time.Minute)
}

// cmsArticlesPort adapts the articles public repo to widgets.ArticlesPort.
// cmsProductsPort adapts the published catalogue to the widget resolver. The
// service already hides unpublished products and resolves the locale, so this
// is a shape change and nothing more.
type cmsProductsPort struct{ svc *catalog.PublicService }

func (p cmsProductsPort) ListProducts(ctx context.Context, q widgets.ProductsQuery) ([]widgets.ProductItem, error) {
	res, err := p.svc.List(ctx, catalog.PublicListParams{
		Category: q.Category, Sort: q.Sort, PageSize: q.Limit, Page: 1, Locale: q.Locale,
	})
	if err != nil {
		return nil, err
	}
	items := make([]widgets.ProductItem, 0, len(res.Items))
	for _, it := range res.Items {
		cats := make([]string, 0, len(it.Categories))
		for _, c := range it.Categories {
			cats = append(cats, c.Name)
		}
		items = append(items, widgets.ProductItem{
			Slug: it.Slug, Name: it.Name, Summary: it.Summary, CoverURL: it.CoverURL,
			CoverWidth: it.CoverWidth, CoverHeight: it.CoverHeight,
			Lifecycle: it.Lifecycle, IsFeatured: it.IsFeatured,
			Audience: it.Audience, Platforms: it.Platforms, Categories: cats,
		})
	}
	return items, nil
}

// cmsMembersPort adapts the public roster. ListPublic forces ActiveOnly, so a
// hidden member cannot reach a landing page through this door either.
type cmsMembersPort struct{ svc *members.Service }

func (p cmsMembersPort) ListMembers(ctx context.Context, q widgets.MembersQuery) ([]widgets.MemberItem, error) {
	res, err := p.svc.ListPublic(ctx, members.ListParams{PageSize: q.Limit, Page: 1, Locale: q.Locale})
	if err != nil {
		return nil, err
	}
	items := make([]widgets.MemberItem, 0, len(res.Items))
	for _, m := range res.Items {
		items = append(items, widgets.MemberItem{
			Slug: m.Slug, FullName: m.FullName, Role: m.Role,
			Bio: m.Bio, AvatarURL: m.AvatarURL,
			AvatarWidth: m.AvatarWidth, AvatarHeight: m.AvatarHeight,
			Skills: m.Skills,
		})
	}
	return items, nil
}

type cmsArticlesPort struct{ repo *cmsarticles.PublicRepo }

func (p cmsArticlesPort) ListArticles(ctx context.Context, q widgets.ArticlesQuery) ([]widgets.ArticleItem, error) {
	var catID *uuid.UUID
	if q.CategoryID != "" {
		if id, err := uuid.Parse(q.CategoryID); err == nil {
			catID = &id
		}
	}
	cards, err := p.repo.ListPublished(ctx, cmsarticles.PublicFilter{
		CategoryID: catID, Tag: q.Tag, Sort: q.Sort, Limit: q.Limit, Locale: q.Locale,
	})
	if err != nil {
		return nil, err
	}
	out := make([]widgets.ArticleItem, 0, len(cards))
	for _, c := range cards {
		var pub *string
		if c.PublishedAt != nil {
			s := c.PublishedAt.Format(time.RFC3339)
			pub = &s
		}
		out = append(out, widgets.ArticleItem{Slug: c.Slug, Title: c.Title, Excerpt: c.Excerpt, PublishedAt: pub})
	}
	return out, nil
}

// cmsCategoriesPort adapts the taxonomy public repo to widgets.CategoriesPort.
type cmsCategoriesPort struct{ repo *cmstaxonomy.PublicRepo }

func (p cmsCategoriesPort) ListCategories(ctx context.Context, q widgets.CategoriesQuery) ([]widgets.CategoryItem, error) {
	// Categories are stored in Vietnamese and translated in the console; the
	// locale-aware read is what finally serves those translations.
	cards, err := p.repo.ListCategoriesIn(ctx, q.Limit, q.Locale)
	if err != nil {
		return nil, err
	}
	out := make([]widgets.CategoryItem, 0, len(cards))
	for _, c := range cards {
		out = append(out, widgets.CategoryItem{Slug: c.Slug, Name: c.Name, Count: c.Count})
	}
	return out, nil
}
