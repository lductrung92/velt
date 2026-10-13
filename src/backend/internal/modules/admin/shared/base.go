package shared

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
)

// ResetSender issues a password-reset/set-password email for a user. Satisfied
// by auth.Service; declared here so admin stays decoupled and testable.
type ResetSender interface {
	SendResetLink(ctx context.Context, userID uuid.UUID) error
}

// Options configures the admin Base.
type Options struct {
	Now    func() time.Time
	Logger *slog.Logger
}

// Base is the cross-feature admin service spine: the RBAC spine repo + shared
// dependencies + the anti-escalation / self-protection helpers every feature
// service relies on. Feature services embed *Base and add their own feature repo.
type Base struct {
	spine   SpineRepo
	reset   ResetSender
	limiter ratelimit.Limiter
	files   storage.URLer
	now     func() time.Time
	log     *slog.Logger
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

// NewBase wires the admin service spine.
func NewBase(spine SpineRepo, reset ResetSender, limiter ratelimit.Limiter, files storage.URLer, opts Options) *Base {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	return &Base{spine: spine, reset: reset, limiter: limiter, files: files, now: opts.Now, log: opts.Logger}
}

// Now returns the configured clock.
func (b *Base) Now() time.Time { return b.now() }

// SendResetLink issues a set-password/reset email for the user.
func (b *Base) SendResetLink(ctx context.Context, userID uuid.UUID) error {
	return b.reset.SendResetLink(ctx, userID)
}

// GetRole fetches a role by id (delegates to the RBAC spine).
func (b *Base) GetRole(ctx context.Context, id uuid.UUID) (*Role, error) {
	return b.spine.GetRole(ctx, id)
}

// GetRoleByCode fetches a role by code (delegates to the RBAC spine).
func (b *Base) GetRoleByCode(ctx context.Context, code string) (*Role, error) {
	return b.spine.GetRoleByCode(ctx, code)
}

// RolePermissionCodes lists a role's permission codes (delegates to the RBAC spine).
func (b *Base) RolePermissionCodes(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	return b.spine.RolePermissionCodes(ctx, roleID)
}

// ActiveSuperAdminIDs lists active super_admin user ids (delegates to the RBAC spine).
func (b *Base) ActiveSuperAdminIDs(ctx context.Context) ([]uuid.UUID, error) {
	return b.spine.ActiveSuperAdminIDs(ctx)
}

// Require enforces the per-endpoint permission gate using the caller's resolved
// claims (the wildcard "*" passes). Denials are audited.
func (b *Base) Require(ctx context.Context, id *httpx.Identity, perm string) error {
	if id == nil {
		return apperr.Unauthorized("unauthorized")
	}
	if id.Has(perm) {
		return nil
	}
	return b.DenyAudit(ctx, id.UserID, "permission:"+perm, apperr.AccessDenied("access_denied"))
}

// ActorEffective returns the actor's CURRENT effective permissions from the DB
// (not stale JWT claims) and whether they are super_admin.
func (b *Base) ActorEffective(ctx context.Context, actorID uuid.UUID) (map[string]bool, bool, error) {
	set, err := b.spine.ActorEffectivePermissions(ctx, actorID)
	if err != nil {
		return nil, false, err
	}
	return set, set[PermWildcard], nil
}

// AssertCanGrantRole enforces anti-escalation for assigning a role: super_admin
// role only by super_admin; otherwise the role's permissions must be a subset of
// the actor's effective permissions.
// It hands back the role it validated so a caller that has to name it in the
// activity log does not read the same row twice.
func (b *Base) AssertCanGrantRole(ctx context.Context, actorID, roleID uuid.UUID) (*Role, error) {
	role, err := b.spine.GetRole(ctx, roleID)
	if errors.Is(err, ErrNotFound) {
		return nil, apperr.Validation(map[string]string{"role_id": "not_found"})
	}
	if err != nil {
		return nil, apperr.Internal()
	}
	set, isSuper, err := b.ActorEffective(ctx, actorID)
	if err != nil {
		return nil, apperr.Internal()
	}
	if role.Code == RoleSuperAdmin {
		if !isSuper {
			return nil, b.DenyAudit(ctx, actorID, "grant_role:super_admin", apperr.AccessDenied("privilege_escalation_denied"))
		}
		return role, nil
	}
	if isSuper {
		return role, nil
	}
	codes, err := b.spine.RolePermissionCodes(ctx, roleID)
	if err != nil {
		return nil, apperr.Internal()
	}
	for _, c := range codes {
		if !set[c] {
			return nil, b.DenyAudit(ctx, actorID, "grant_role:"+role.Code, apperr.AccessDenied("privilege_escalation_denied"))
		}
	}
	return role, nil
}

// AssertCanGrantPermissions enforces anti-escalation for building/editing a role:
// every permission must exist and be held by the actor (only super_admin may
// include the wildcard).
func (b *Base) AssertCanGrantPermissions(ctx context.Context, actorID uuid.UUID, permIDs []uuid.UUID) error {
	unique := DedupeIDs(permIDs)
	codes, err := b.spine.PermissionCodesByIDs(ctx, unique)
	if err != nil {
		return apperr.Internal()
	}
	if len(codes) != len(unique) {
		return apperr.Validation(map[string]string{"permission_ids": "invalid"})
	}
	set, isSuper, err := b.ActorEffective(ctx, actorID)
	if err != nil {
		return apperr.Internal()
	}
	if isSuper {
		return nil
	}
	for _, c := range codes {
		if c == PermWildcard || !set[c] {
			return b.DenyAudit(ctx, actorID, "grant_permissions", apperr.AccessDenied("privilege_escalation_denied"))
		}
	}
	return nil
}

// AssertNotLastSuperAdmin blocks an action that would remove the last active
// super_admin.
func (b *Base) AssertNotLastSuperAdmin(ctx context.Context, targetID uuid.UUID) error {
	isSuper, err := b.spine.UserIsSuperAdmin(ctx, targetID)
	if err != nil {
		return apperr.Internal()
	}
	if !isSuper {
		return nil
	}
	ids, err := b.spine.ActiveSuperAdminIDs(ctx)
	if err != nil {
		return apperr.Internal()
	}
	if len(ids) <= 1 {
		return apperr.Conflict("last_super_admin")
	}
	return nil
}

// Allow consults the rate limiter, FAILING CLOSED (admin actions are sensitive).
func (b *Base) Allow(ctx context.Context, key string, limit int, window time.Duration) error {
	ok, retryAfter, err := b.limiter.Allow(ctx, key, limit, window)
	if err != nil {
		b.Sec(ctx).Error("rate limiter error", "err", err)
		return apperr.RateLimited(1)
	}
	if !ok {
		return apperr.RateLimited(retryAfter)
	}
	return nil
}

// Sec returns the correlation-scoped security logger.
func (b *Base) Sec(ctx context.Context) *slog.Logger {
	return b.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx))
}

// DenyAudit logs an authorization / self-protection denial at Warn, then returns
// the error unchanged.
func (b *Base) DenyAudit(ctx context.Context, actor uuid.UUID, action string, err error) error {
	b.Sec(ctx).Warn("admin action denied", "actor", actor, "action", action, "reason", err.Error())
	return err
}

// AvatarURL builds the served URL for a stored avatar path (nil when absent).
func (b *Base) AvatarURL(ctx context.Context, path *string) *string {
	if path == nil || *path == "" {
		return nil
	}
	u := b.files.URL(ctx, *path)
	return &u
}
