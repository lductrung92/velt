package users

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/platform/crypto"
)

const (
	rlResetPerTarget = 5
	rlResetWindow    = 15 * time.Minute
)

// Service holds user-management business logic.
type Service struct {
	*shared.Base
	repo Repository
}

// NewService wires the users service onto the shared admin base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListUsers returns a paginated, filtered page of users with roles + 2FA status
// (batched, no N+1). Requires users.read.
func (s *Service) ListUsers(ctx context.Context, id *httpx.Identity, f ListUsersFilter) (shared.Page[UserDetail], error) {
	if err := s.Require(ctx, id, permUsersRead); err != nil {
		return shared.Page[UserDetail]{}, err
	}
	page, pageSize := shared.NormalizePage(f.Page, f.PageSize)
	usersRows, total, err := s.repo.ListUsers(ctx, f)
	if err != nil {
		return shared.Page[UserDetail]{}, apperr.Internal()
	}
	ids := make([]uuid.UUID, len(usersRows))
	for i := range usersRows {
		ids[i] = usersRows[i].ID
	}
	rolesMap, err := s.repo.RolesForUsers(ctx, ids)
	if err != nil {
		return shared.Page[UserDetail]{}, apperr.Internal()
	}
	tfMap, err := s.repo.TwoFactorEnabledForUsers(ctx, ids)
	if err != nil {
		return shared.Page[UserDetail]{}, apperr.Internal()
	}
	items := make([]UserDetail, len(usersRows))
	for i := range usersRows {
		u := usersRows[i]
		items[i] = UserDetail{
			UserResponse:     toUserResponse(&u, s.AvatarURL(ctx, u.AvatarPath)),
			Roles:            nonNilRoles(rolesMap[u.ID]),
			TwoFactorEnabled: tfMap[u.ID],
		}
	}
	return shared.Page[UserDetail]{Items: items, Total: total, Page: page, PageSize: pageSize}, nil
}

// GetUser returns one user with roles + 2FA status. Requires users.read.
func (s *Service) GetUser(ctx context.Context, id *httpx.Identity, targetID uuid.UUID) (UserDetail, error) {
	if err := s.Require(ctx, id, permUsersRead); err != nil {
		return UserDetail{}, err
	}
	u, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
		return UserDetail{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	return s.adminUser(ctx, u)
}

// CreateUser creates a user (no password; a set-password mail is sent), assigning
// roles under anti-escalation. Requires users.create.
func (s *Service) CreateUser(ctx context.Context, id *httpx.Identity, req CreateUserRequest) (UserDetail, error) {
	if err := s.Require(ctx, id, permUsersCreate); err != nil {
		return UserDetail{}, err
	}
	roleIDs, err := s.resolveCreateRoles(ctx, id.UserID, req.RoleIDs)
	if err != nil {
		return UserDetail{}, err
	}
	if _, err := s.repo.GetUserByEmail(ctx, req.Email); err == nil {
		return UserDetail{}, apperr.Conflict("conflict")
	} else if !errors.Is(err, shared.ErrNotFound) {
		return UserDetail{}, apperr.Internal()
	}
	// Unusable random password — the user sets a real one via the emailed link.
	rnd, err := crypto.RandomToken(32)
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	hash, err := crypto.HashPassword(rnd)
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	u, err := s.repo.CreateUser(ctx, req.Email, req.FullName, hash, roleIDs, id.UserID)
	if errors.Is(err, shared.ErrConflict) {
		return UserDetail{}, apperr.Conflict("conflict")
	}
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	if err := s.SendResetLink(ctx, u.ID); err != nil {
		s.Sec(ctx).Warn("create user: set-password mail failed", "user_id", u.ID, "err", err)
	}
	s.Sec(ctx).Info("admin created user", "actor", id.UserID, "target", u.ID)
	return s.adminUser(ctx, u)
}

// resolveCreateRoles defaults to Editor and enforces the single-role / anti-
// escalation rules on the requested roles.
func (s *Service) resolveCreateRoles(ctx context.Context, actorID uuid.UUID, requested []uuid.UUID) ([]uuid.UUID, error) {
	_, isSuper, err := s.ActorEffective(ctx, actorID)
	if err != nil {
		return nil, apperr.Internal()
	}
	roleIDs := requested
	if len(roleIDs) == 0 {
		editor, err := s.GetRoleByCode(ctx, roleEditor)
		if err != nil {
			return nil, apperr.Internal()
		}
		roleIDs = []uuid.UUID{editor.ID}
	}
	for _, rid := range roleIDs {
		if isSuper {
			if err := s.AssertCanGrantRole(ctx, actorID, rid); err != nil {
				return nil, err
			}
			continue
		}
		// Console single-role rule: a non-super_admin may only create Editor accounts.
		role, err := s.GetRole(ctx, rid)
		if errors.Is(err, shared.ErrNotFound) {
			return nil, apperr.Validation(map[string]string{"role_ids": "not_found"})
		} else if err != nil {
			return nil, apperr.Internal()
		}
		if role.Code != roleEditor {
			return nil, s.DenyAudit(ctx, actorID, "create_user:non_editor", apperr.AccessDenied("privilege_escalation_denied"))
		}
	}
	return roleIDs, nil
}

// UpdateUser edits full_name/status, and (super_admin only) replaces the user's
// single role. Self-disable → cannot_modify_self; disabling/demoting the last
// super_admin → last_super_admin; disabling revokes sessions. Requires users.update.
func (s *Service) UpdateUser(ctx context.Context, id *httpx.Identity, targetID uuid.UUID, req UpdateUserRequest) (UserDetail, error) {
	if err := s.Require(ctx, id, permUsersUpdate); err != nil {
		return UserDetail{}, err
	}
	disabling := req.Status != nil && *req.Status == statusDisabled
	if disabling && targetID == id.UserID {
		return UserDetail{}, s.DenyAudit(ctx, id.UserID, "update_user:self_disable", apperr.AccessDenied("cannot_modify_self"))
	}
	existing, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
		return UserDetail{}, apperr.NotFound("not_found")
	} else if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	if err := s.validateRoleChange(ctx, id.UserID, targetID, req.RoleID); err != nil {
		return UserDetail{}, err
	}
	reactivating := req.Status != nil && *req.Status == statusActive && existing.Status != statusActive
	if disabling {
		if err := s.AssertNotLastSuperAdmin(ctx, targetID); err != nil {
			return UserDetail{}, err
		}
	}
	// Single transaction: profile/status (+ revoke sessions when disabling, AD-3) +
	// role replacement, so a mid-sequence failure can't half-apply the edit.
	var roleIDs *[]uuid.UUID
	if req.RoleID != nil {
		rs := []uuid.UUID{*req.RoleID}
		roleIDs = &rs
	}
	if err := s.repo.UpdateUserAtomic(ctx, targetID, req.FullName, req.Status, disabling, roleIDs, id.UserID, s.Now()); err != nil {
		if errors.Is(err, ErrLastSuperAdmin) {
			return UserDetail{}, apperr.Conflict("last_super_admin")
		}
		return UserDetail{}, apperr.Internal()
	}
	if req.RoleID != nil {
		s.Sec(ctx).Info("admin set user role", "actor", id.UserID, "target", targetID, "role", *req.RoleID)
	}
	if reactivating {
		if err := s.SendResetLink(ctx, targetID); err != nil {
			s.Sec(ctx).Warn("re-activate user: set-password mail failed", "user_id", targetID, "err", err)
		}
	}
	s.Sec(ctx).Info("admin updated user", "actor", id.UserID, "target", targetID, "disabled", disabling, "reactivated", reactivating)
	u, err := s.repo.GetUser(ctx, targetID)
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	return s.adminUser(ctx, u)
}

// validateRoleChange enforces the single-role replacement rules before any
// mutation: no-op when nil; only super_admin may set a role; the role must exist;
// replacing super_admin with a lesser role must not orphan the last super_admin.
func (s *Service) validateRoleChange(ctx context.Context, actorID, targetID uuid.UUID, roleID *uuid.UUID) error {
	if roleID == nil {
		return nil
	}
	if _, isSuper, err := s.ActorEffective(ctx, actorID); err != nil {
		return apperr.Internal()
	} else if !isSuper {
		return s.DenyAudit(ctx, actorID, "update_user:role_non_super", apperr.AccessDenied("privilege_escalation_denied"))
	}
	role, err := s.GetRole(ctx, *roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.Validation(map[string]string{"role_id": "not_found"})
	} else if err != nil {
		return apperr.Internal()
	}
	if role.Code != shared.RoleSuperAdmin {
		return s.AssertNotLastSuperAdmin(ctx, targetID)
	}
	return nil
}

// DeleteUser soft-deletes (status=disabled) by default; hard delete is
// super_admin-only. Self → cannot_modify_self; last super_admin → 409. Requires users.delete.
func (s *Service) DeleteUser(ctx context.Context, id *httpx.Identity, targetID uuid.UUID, hard bool) error {
	if err := s.Require(ctx, id, permUsersDelete); err != nil {
		return err
	}
	if targetID == id.UserID {
		return s.DenyAudit(ctx, id.UserID, "delete_user:self", apperr.AccessDenied("cannot_modify_self"))
	}
	if _, err := s.repo.GetUser(ctx, targetID); errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	if err := s.AssertNotLastSuperAdmin(ctx, targetID); err != nil {
		return err
	}
	if hard {
		if _, isSuper, err := s.ActorEffective(ctx, id.UserID); err != nil {
			return apperr.Internal()
		} else if !isSuper {
			return s.DenyAudit(ctx, id.UserID, "hard_delete_user", apperr.AccessDenied("access_denied"))
		}
		if err := s.repo.HardDeleteUser(ctx, targetID); err != nil {
			return apperr.Internal()
		}
		s.Sec(ctx).Info("admin hard-deleted user", "actor", id.UserID, "target", targetID)
		return nil
	}
	disabled := statusDisabled
	if err := s.repo.UpdateUserAtomic(ctx, targetID, nil, &disabled, true, nil, id.UserID, s.Now()); err != nil {
		if errors.Is(err, ErrLastSuperAdmin) {
			return apperr.Conflict("last_super_admin")
		}
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin disabled user", "actor", id.UserID, "target", targetID)
	return nil
}

// AssignRole grants a role under anti-escalation. Requires users.assign_role.
func (s *Service) AssignRole(ctx context.Context, id *httpx.Identity, targetID, roleID uuid.UUID) error {
	if err := s.Require(ctx, id, permUsersAssign); err != nil {
		return err
	}
	if _, err := s.repo.GetUser(ctx, targetID); errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	if err := s.AssertCanGrantRole(ctx, id.UserID, roleID); err != nil {
		return err
	}
	if err := s.repo.AssignRole(ctx, targetID, roleID, id.UserID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin assigned role", "actor", id.UserID, "target", targetID, "role", roleID)
	return nil
}

// RemoveRole revokes a role. Removing super_admin requires the actor to be
// super_admin and must not orphan the last super_admin. Requires users.assign_role.
func (s *Service) RemoveRole(ctx context.Context, id *httpx.Identity, targetID, roleID uuid.UUID) error {
	if err := s.Require(ctx, id, permUsersAssign); err != nil {
		return err
	}
	// Verify the target user exists (parity with AssignRole) so a remove against a
	// non-existent user returns 404 rather than a misleading 204 no-op.
	if _, err := s.repo.GetUser(ctx, targetID); errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	role, err := s.GetRole(ctx, roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	if err != nil {
		return apperr.Internal()
	}
	if role.Code == shared.RoleSuperAdmin {
		if _, isSuper, err := s.ActorEffective(ctx, id.UserID); err != nil {
			return apperr.Internal()
		} else if !isSuper {
			return s.DenyAudit(ctx, id.UserID, "remove_role:super_admin", apperr.AccessDenied("privilege_escalation_denied"))
		}
		if err := s.AssertNotLastSuperAdmin(ctx, targetID); err != nil {
			return err
		}
	}
	if err := s.repo.RemoveRole(ctx, targetID, roleID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin removed role", "actor", id.UserID, "target", targetID, "role", roleID)
	return nil
}

// TriggerResetPassword emails a reset link to the target. Rate-limited; target
// must be active. Requires users.update.
func (s *Service) TriggerResetPassword(ctx context.Context, id *httpx.Identity, targetID uuid.UUID) error {
	if err := s.Require(ctx, id, permUsersUpdate); err != nil {
		return err
	}
	if err := s.Allow(ctx, "admin:reset:user:"+targetID.String(), rlResetPerTarget, rlResetWindow); err != nil {
		return err
	}
	u, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	if err != nil {
		return apperr.Internal()
	}
	if u.Status != statusActive {
		return apperr.Conflict("conflict")
	}
	if err := s.SendResetLink(ctx, targetID); err != nil {
		s.Sec(ctx).Error("admin trigger reset: send link", "err", err)
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin triggered reset", "actor", id.UserID, "target", targetID)
	return nil
}

// adminUser builds the UserDetail for a single user (roles + 2FA).
func (s *Service) adminUser(ctx context.Context, u *User) (UserDetail, error) {
	roles, err := s.repo.RolesForUser(ctx, u.ID)
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	tf, err := s.repo.TwoFactorEnabledForUsers(ctx, []uuid.UUID{u.ID})
	if err != nil {
		return UserDetail{}, apperr.Internal()
	}
	return UserDetail{
		UserResponse:     toUserResponse(u, s.AvatarURL(ctx, u.AvatarPath)),
		Roles:            nonNilRoles(roles),
		TwoFactorEnabled: tf[u.ID],
	}, nil
}
