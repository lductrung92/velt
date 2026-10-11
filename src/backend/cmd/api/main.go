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
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/account"
	"github.com/velt/backend/internal/modules/admin"
	"github.com/velt/backend/internal/modules/auth"
	"github.com/velt/backend/internal/modules/cms"
	cmsarticles "github.com/velt/backend/internal/modules/cms/articles"
	cmstaxonomy "github.com/velt/backend/internal/modules/cms/taxonomy"
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/modules/files"
	"github.com/velt/backend/internal/modules/members"
	"github.com/velt/backend/internal/modules/products"
	"github.com/velt/backend/internal/modules/settings"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/internal/platform/mail"
	"github.com/velt/backend/internal/platform/ratelimit"
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
		httpx.RequestLogger,
		httpx.Recoverer,
		chimw.Timeout(requestTimeout),
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
	admin.Register(r, pool, authSvc, limiter, store, logger, authMW)
	// members bounded context: the public team roster the site shows and
	// products attach to. Separate from users (login identity) by design.
	members.Register(r, pool, store, settingsSvc, logger, authMW)
	// products bounded context: the catalog VELT sells, plus its own taxonomy.
	products.Register(r, pool, store, settingsSvc, logger, authMW,
		revalidate.NewHTTP(cfg.CustomerWebBaseURL, cfg.RevalidateSecret, logger))
	// cms bounded context (taxonomy + feature-flag settings + articles/pages/menus/
	// landing/comments/newsletter); settingsSvc is the scoped reader/writer for the
	// cms.* registry keys (CMS gates cms.settings.* itself).
	// Data readers for CMS widget resolvers, each adapted to a narrow widgets port
	// (articles_list / categories_showcase). Stateless over the pool. Games is left
	// nil — there is no games catalog in this deployment, so a games_list widget
	// resolves to nothing (the resolver is nil-safe by design).
	cms.Register(r, pool, settingsSvc, store, logger, authMW, widgets.Ports{
		Articles:   cmsArticlesPort{cmsarticles.NewPublicRepository(pool)},
		Categories: cmsCategoriesPort{cmstaxonomy.NewPublicRepository(pool)},
	}, revalidate.NewHTTP(cfg.CustomerWebBaseURL, cfg.RevalidateSecret, logger), limiter, cfg.TrustProxyHeaders)
	// Public asset serving (avatars + CMS article media) when the storage driver
	// is local; the S3 driver serves them straight from the bucket endpoint.
	files.RegisterRoutes(r, filesHandler)

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
type cmsArticlesPort struct{ repo *cmsarticles.PublicRepo }

func (p cmsArticlesPort) ListArticles(ctx context.Context, q widgets.ArticlesQuery) ([]widgets.ArticleItem, error) {
	var catID *uuid.UUID
	if q.CategoryID != "" {
		if id, err := uuid.Parse(q.CategoryID); err == nil {
			catID = &id
		}
	}
	cards, err := p.repo.ListPublished(ctx, cmsarticles.PublicFilter{CategoryID: catID, Tag: q.Tag, Limit: q.Limit})
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
	cards, err := p.repo.ListCategories(ctx, q.Limit)
	if err != nil {
		return nil, err
	}
	out := make([]widgets.CategoryItem, 0, len(cards))
	for _, c := range cards {
		out = append(out, widgets.CategoryItem{Slug: c.Slug, Name: c.Name, Count: c.Count})
	}
	return out, nil
}
