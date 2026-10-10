package shared

import (
	"context"
	"log/slog"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/revalidate"
)

// Base is the cross-feature service spine every CMS feature service embeds. It
// carries the settings port and logger and provides the shared permission gate,
// security logger, and feature-flag reads. Feature services embed *Base and add
// their own feature repository.
type Base struct {
	settings SettingsPort
	log      *slog.Logger
	rev      revalidate.Revalidator
}

// NewBase builds the shared CMS service spine.
func NewBase(settings SettingsPort, log *slog.Logger) *Base {
	if log == nil {
		log = slog.Default()
	}
	return &Base{settings: settings, log: log, rev: revalidate.Nop{}}
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
	b.Sec(ctx).Warn("cms action denied", "actor", id.UserID, "action", "permission:"+perm)
	return apperr.AccessDenied("access_denied")
}

// Sec returns the correlation-scoped security logger.
func (b *Base) Sec(ctx context.Context) *slog.Logger {
	return b.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// BoolFlag reads one cms.* boolean feature-flag, returning def if the read fails
// or the key/value is absent — so a transient settings error never silently
// flips behavior.
func (b *Base) BoolFlag(ctx context.Context, key string, def bool) bool {
	view, err := b.settings.GroupView(ctx, GroupCMS)
	if err != nil {
		return def
	}
	for _, e := range view[GroupCMS] {
		if e["key"] == key {
			if v, ok := e["value"].(bool); ok {
				return v
			}
		}
	}
	return def
}

// AllowSlugEdit — cms.article.allow_slug_edit: ON → slugs are user-controlled
// (manual input, collision rejected); OFF → system-managed (auto-derived + auto-suffix).
func (b *Base) AllowSlugEdit(ctx context.Context) bool {
	return b.BoolFlag(ctx, FlagArticleAllowSlugEdit, true)
}

// CategorizeRequired — cms.article.categorize: ON → an article must have a
// category at create time.
func (b *Base) CategorizeRequired(ctx context.Context) bool {
	return b.BoolFlag(ctx, FlagArticleCategorize, true)
}

// RequireReview — cms.article.require_review: ON → an editor-authored article
// goes through review (editor can't publish directly).
func (b *Base) RequireReview(ctx context.Context) bool {
	return b.BoolFlag(ctx, FlagArticleRequireReview, true)
}

// SchedulingEnabled — cms.publish.allow_now OFF → the `scheduled` status is
// offered (with a future publish_at). ON → no scheduling option (does NOT block
// immediate publish; status-field model).
func (b *Base) SchedulingEnabled(ctx context.Context) bool {
	return !b.BoolFlag(ctx, FlagPublishAllowNow, true)
}

// GetInt reads a foundation integer setting (e.g. storage.max_upload_mb) via the
// settings port; 0 when absent.
func (b *Base) GetInt(ctx context.Context, key string) int {
	return b.settings.GetInt(ctx, key)
}
