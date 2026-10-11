// Package shared is the CRM bounded context's spine: the sentinel errors every
// feature repository speaks, and the service base that turns them into wire
// errors behind a permission gate. Mirrors products/shared and cms/shared so a
// reader who knows one knows them all.
package shared

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Sentinel errors returned by feature repositories.
var (
	ErrNotFound = errors.New("not found")
	// ErrLinkTargetMissing is an FK violation when attaching a lead to a product
	// or member id that does not exist — a client-supplied id, so it maps to 422
	// rather than 500.
	ErrLinkTargetMissing = errors.New("link target missing")
	// ErrUnreachable is the DB refusing a lead with no contact channel.
	ErrUnreachable = errors.New("lead has no contact channel")
)

// Wrap annotates a non-nil error with an operation label (%w-wrapped), nil-safe.
func Wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}

// IsForeignKeyViolation reports a Postgres 23503 foreign-key violation.
func IsForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// IsCheckViolation reports a Postgres 23514 check-constraint violation for the
// named constraint.
func IsCheckViolation(err error, name string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514" && pgErr.ConstraintName == name
}

// Base is the CRM service spine. Feature services embed *Base and add their own
// repository.
type Base struct {
	log *slog.Logger
}

// NewBase wires the CRM service spine.
func NewBase(logger *slog.Logger) *Base {
	if logger == nil {
		logger = slog.Default()
	}
	return &Base{log: logger}
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
	b.Sec(ctx).Warn("crm action denied", "actor", id.UserID, "action", "permission:"+perm)
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
	case errors.Is(err, ErrLinkTargetMissing):
		return apperr.Validation(map[string]string{"product_ids": "unknown"})
	case errors.Is(err, ErrUnreachable):
		return apperr.Validation(map[string]string{"contact": "required"})
	default:
		b.Sec(ctx).Error("crm: "+op, "err", err)
		return apperr.Internal()
	}
}
