// Package admin is the administration bounded context (manage other users + RBAC).
// It is a parent directory of self-contained feature sub-packages (users, roles,
// sessions), each with its own Handler/Service/Repository; the cross-feature RBAC
// spine (anti-escalation / self-protection) lives in admin/shared. This root holds
// only the single wiring entry point (Register).
package admin

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/roles"
	"github.com/velt/backend/internal/modules/admin/sessions"
	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/users"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
)

// Register mounts the full admin surface under /api/admin — all gated by authMW;
// per-endpoint permissions + safety constraints are enforced in each feature's
// service layer. Single wiring entry point for the bounded context.
func Register(r chi.Router, pool *pgxpool.Pool, reset shared.ResetSender, limiter ratelimit.Limiter, files storage.URLer, log *slog.Logger, authMW func(http.Handler) http.Handler) {
	base := shared.NewBase(shared.NewSpineRepo(pool), reset, limiter, files, shared.Options{Logger: log})
	r.Route("/api/admin", func(r chi.Router) {
		r.Use(authMW)
		users.Register(r, base, pool)
		roles.Register(r, base, pool)
		sessions.Register(r, base, pool)
	})
}
