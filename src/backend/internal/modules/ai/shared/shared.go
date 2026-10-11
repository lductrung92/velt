// Package shared is the AI bounded context's spine: sentinel errors, the
// service base with its permission gate, and the error mapping every feature
// service relies on. Mirrors crm/shared and products/shared.
package shared

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// Sentinel errors returned by feature repositories and services.
var (
	ErrNotFound = errors.New("not found")
	// ErrClosed is a write into a conversation that has ended.
	ErrClosed = errors.New("conversation closed")
	// ErrTurnLimit is a conversation that has used up its allowance.
	ErrTurnLimit = errors.New("turn limit reached")
	// ErrAlreadyClaimed is two people taking the same conversation; the loser
	// gets told rather than silently sharing the customer.
	ErrAlreadyClaimed = errors.New("already claimed")
	// ErrNotOwner is a visitor_key that does not own the conversation.
	ErrNotOwner = errors.New("not the owner")
	// ErrNoStaff is a handoff request with nobody on duty.
	ErrNoStaff = errors.New("no staff online")
)

// Wrap annotates a non-nil error with an operation label (%w-wrapped), nil-safe.
func Wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}

// Base is the AI service spine.
type Base struct {
	log *slog.Logger
}

// NewBase wires the AI service spine.
func NewBase(logger *slog.Logger) *Base {
	if logger == nil {
		logger = slog.Default()
	}
	return &Base{log: logger}
}

// Require enforces the per-endpoint permission gate. Only the console-facing
// surface uses it: the visitor-facing one has no identity by design.
func (b *Base) Require(ctx context.Context, id *httpx.Identity, perm string) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if id.Has(perm) {
		return nil
	}
	b.Sec(ctx).Warn("ai action denied", "actor", id.UserID, "action", "permission:"+perm)
	return apperr.AccessDenied("access_denied")
}

// Sec returns the correlation-scoped security logger.
func (b *Base) Sec(ctx context.Context) *slog.Logger {
	return b.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// MapRepoErr converts sentinels into wire errors. Anything else is a genuine
// fault and becomes a 500 (details stay in the log, not the response).
func (b *Base) MapRepoErr(ctx context.Context, op string, err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return apperr.NotFound("not_found")
	case errors.Is(err, ErrNotOwner):
		// Deliberately 404, not 403: confirming that a conversation exists but
		// belongs to someone else is itself a leak.
		return apperr.NotFound("not_found")
	case errors.Is(err, ErrClosed):
		return apperr.New(http.StatusConflict, "conversation_closed")
	case errors.Is(err, ErrTurnLimit):
		return apperr.New(http.StatusTooManyRequests, "turn_limit_reached")
	case errors.Is(err, ErrAlreadyClaimed):
		return apperr.New(http.StatusConflict, "already_claimed")
	case errors.Is(err, ErrNoStaff):
		return apperr.New(http.StatusConflict, "no_staff_online")
	default:
		b.Sec(ctx).Error("ai: "+op, "err", err)
		return apperr.Internal()
	}
}
