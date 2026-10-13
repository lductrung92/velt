// Package shared holds the cross-feature spine of the products bounded context:
// sentinel errors, error helpers, and the Base service every feature embeds. It
// imports no sibling feature package (the dependency graph is feature → shared,
// never feature → feature), mirroring cms/shared and admin/shared.
package shared

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/revalidate"
)

// Sentinel errors returned by feature repositories and mapped to AppErrors by
// the feature services.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict") // unique violation (slug taken)
	// ErrLinkTargetMissing is an FK violation when linking a product to a
	// category or member id that does not exist — a client-supplied id, so it
	// maps to 422 rather than 500.
	ErrLinkTargetMissing = errors.New("link target missing")
)

// Wrap annotates a non-nil error with an operation label (%w-wrapped), nil-safe.
func Wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}

// IsUniqueViolation reports a Postgres 23505 unique-constraint violation.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// IsForeignKeyViolation reports a Postgres 23503 foreign-key violation.
func IsForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// Base is the products service spine: the shared dependencies and the
// permission gate every feature service relies on. Feature services embed
// *Base and add their own repository.
type Base struct {
	log *slog.Logger
	rev revalidate.Revalidator
	// acts is wired after construction and may stay nil, which is what this
	// context looked like before the activity log existed.
	acts activity.Recorder
}

// SetActivity wires the activity recorder (called once at startup).
func (b *Base) SetActivity(r activity.Recorder) { b.acts = r }

// Record files one entry in the activity log. A nil recorder is a no-op: the
// log is a record OF the action, never a condition for it.
func (b *Base) Record(ctx context.Context, id *httpx.Identity, e activity.Entry) {
	if b.acts == nil {
		return
	}
	b.acts.Record(ctx, id, e)
}

// NewBase wires the products service spine.
func NewBase(logger *slog.Logger) *Base {
	if logger == nil {
		logger = slog.Default()
	}
	return &Base{log: logger, rev: revalidate.Nop{}}
}

// SetRevalidator wires the web ISR revalidator (called once at startup). When
// unset, publishes rely on the plain ISR window (Nop).
func (b *Base) SetRevalidator(r revalidate.Revalidator) {
	if r != nil {
		b.rev = r
	}
}

// Revalidate drops the web's cached entries for the given tags (best-effort).
func (b *Base) Revalidate(ctx context.Context, tags ...string) {
	b.rev.Revalidate(ctx, tags...)
}

// Require enforces the per-endpoint permission gate using the caller's resolved
// claims (the wildcard "*" passes). Denials are logged to the security log.
func (b *Base) Require(ctx context.Context, id *httpx.Identity, perm string) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if id.Has(perm) {
		return nil
	}
	b.Sec(ctx).Warn("products action denied", "actor", id.UserID, "action", "permission:"+perm)
	return apperr.AccessDenied("access_denied")
}

// Sec returns the correlation-scoped security logger.
func (b *Base) Sec(ctx context.Context) *slog.Logger {
	return b.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// MapRepoErr converts repository sentinels into wire errors. Anything else is a
// genuine fault and becomes a 500 (details stay in the log, not the response).
func (b *Base) MapRepoErr(ctx context.Context, op string, err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return apperr.NotFound("not_found")
	case errors.Is(err, ErrConflict):
		return apperr.Validation(map[string]string{"slug": "taken"})
	default:
		b.Sec(ctx).Error("products: "+op, "err", err)
		return apperr.Internal()
	}
}
