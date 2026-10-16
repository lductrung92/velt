package shared

import (
	"context"
	"log/slog"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/media"
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
	// acts is wired after construction and may stay nil, which is what this
	// context looked like before the activity log existed.
	acts activity.Recorder
	// media mints the public slug for an upload and forgets it again when the
	// bytes are deleted; nil before it is wired.
	media media.Keeper
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

// SetMedia wires the files-table keeper (called once at startup). Like the
// activity recorder it may stay nil, and nil means uploads keep returning the
// legacy /api/files URL — which still serves — and deletes reclaim the bytes
// only, exactly as they did before the table existed.
func (b *Base) SetMedia(m media.Keeper) { b.media = m }

// Media returns the minter, or nil when none is wired.
func (b *Base) Media() media.Minter { return b.media }

// MediaForget returns the forgetter the delete paths call, or nil when none is
// wired.
func (b *Base) MediaForget() media.Forgetter { return b.media }

// MediaLookup returns the bulk `files` reader, or nil when none is wired. It is
// what lets a cleanup path ask what a stored key is called in public.
func (b *Base) MediaLookup() media.BulkRepository {
	if b.media == nil {
		return nil
	}
	return b.media
}
