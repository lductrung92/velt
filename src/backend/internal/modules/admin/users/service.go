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

	// tempPasswordBytes of entropy, base64url-encoded, is what an admin reads
	// out to a new user; see tempPassword.
	tempPasswordBytes = 12
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

// CreateUser creates a user with a server-minted temporary password, assigning
// roles under anti-escalation. The plaintext is returned once, to be handed to
// the new user out of band. Requires users.create.
func (s *Service) CreateUser(ctx context.Context, id *httpx.Identity, req CreateUserRequest) (UserCredentials, error) {
	if err := s.Require(ctx, id, permUsersCreate); err != nil {
		return UserCredentials{}, err
	}
	roleIDs, err := s.resolveCreateRoles(ctx, id.UserID, req.RoleIDs)
	if err != nil {
		return UserCredentials{}, err
	}
	if _, err := s.repo.GetUserByEmail(ctx, req.Email); err == nil {
		return UserCredentials{}, apperr.Conflict("conflict")
	} else if !errors.Is(err, shared.ErrNotFound) {
		return UserCredentials{}, apperr.Internal()
	}
	plain, hash, err := tempPassword()
	if err != nil {
		return UserCredentials{}, apperr.Internal()
	}
	u, err := s.repo.CreateUser(ctx, req.Email, req.FullName, hash, roleIDs, id.UserID)
	if errors.Is(err, shared.ErrConflict) {
		return UserCredentials{}, apperr.Conflict("conflict")
	}
	if err != nil {
		return UserCredentials{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin created user", "actor", id.UserID, "target", u.ID)
	s.Record(ctx, id, userEntry(actionCreated, u.ID, u.FullName, map[string]any{"email": u.Email}))
	return s.withTempPassword(ctx, u, plain)
}

// tempPassword mints a temporary password and its argon2id hash. 12 random
// bytes render as 16 URL-safe characters, clearing the shared password policy
// (authpolicy.MinPasswordLen) without the admin having to invent anything.
func tempPassword() (plain, hash string, err error) {
	plain, err = crypto.RandomToken(tempPasswordBytes)
	if err != nil {
		return "", "", err
	}
	hash, err = crypto.HashPassword(plain)
	if err != nil {
		return "", "", err
	}
	return plain, hash, nil
}

// withTempPassword pairs the freshly read user with the plaintext the caller is
// about to show once. The plaintext never reaches a log line.
func (s *Service) withTempPassword(ctx context.Context, u *User, plain string) (UserCredentials, error) {
	detail, err := s.adminUser(ctx, u)
	if err != nil {
		return UserCredentials{}, err
	}
	return UserCredentials{UserDetail: detail, TemporaryPassword: plain}, nil
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
			if _, err := s.AssertCanGrantRole(ctx, actorID, rid); err != nil {
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
	newRole, err := s.validateRoleChange(ctx, id.UserID, targetID, req.RoleID)
	if err != nil {
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
	if newRole != nil {
		s.Sec(ctx).Info("admin set user role", "actor", id.UserID, "target", targetID, "role", newRole.ID)
		s.Record(ctx, id, userEntry(actionRoleAssigned, targetID, existing.FullName,
			map[string]any{"role": newRole.Code, "replaces_previous": true}))
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
	// Losing an account is the half of this anyone comes back for, so it gets its
	// own code; every other edit is one "updated" carrying the status move.
	action := actionUpdated
	if disabling {
		action = actionDisabled
	}
	var meta map[string]any
	if existing.Status != u.Status {
		meta = map[string]any{"from": existing.Status, "to": u.Status}
	}
	s.Record(ctx, id, userEntry(action, targetID, u.FullName, meta))
	return s.adminUser(ctx, u)
}

// validateRoleChange enforces the single-role replacement rules before any
// mutation: no-op when nil; only super_admin may set a role; the role must exist;
// replacing super_admin with a lesser role must not orphan the last super_admin.
func (s *Service) validateRoleChange(ctx context.Context, actorID, targetID uuid.UUID, roleID *uuid.UUID) (*shared.Role, error) {
	if roleID == nil {
		return nil, nil
	}
	if _, isSuper, err := s.ActorEffective(ctx, actorID); err != nil {
		return nil, apperr.Internal()
	} else if !isSuper {
		return nil, s.DenyAudit(ctx, actorID, "update_user:role_non_super", apperr.AccessDenied("privilege_escalation_denied"))
	}
	role, err := s.GetRole(ctx, *roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return nil, apperr.Validation(map[string]string{"role_id": "not_found"})
	} else if err != nil {
		return nil, apperr.Internal()
	}
	if role.Code != shared.RoleSuperAdmin {
		if err := s.AssertNotLastSuperAdmin(ctx, targetID); err != nil {
			return nil, err
		}
	}
	return role, nil
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
	// Read before the delete: once the row is gone nothing can name it.
	target, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
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
		s.Record(ctx, id, userEntry(actionDeleted, targetID, target.FullName,
			map[string]any{"email": target.Email}))
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
	// A plain delete only disables the account, so that is what the row says.
	s.Record(ctx, id, userEntry(actionDisabled, targetID, target.FullName,
		map[string]any{"soft_delete": true}))
	return nil
}

// AssignRole grants a role under anti-escalation. Requires users.assign_role.
func (s *Service) AssignRole(ctx context.Context, id *httpx.Identity, targetID, roleID uuid.UUID) error {
	if err := s.Require(ctx, id, permUsersAssign); err != nil {
		return err
	}
	target, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	} else if err != nil {
		return apperr.Internal()
	}
	role, err := s.AssertCanGrantRole(ctx, id.UserID, roleID)
	if err != nil {
		return err
	}
	if err := s.repo.AssignRole(ctx, targetID, roleID, id.UserID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin assigned role", "actor", id.UserID, "target", targetID, "role", roleID)
	s.Record(ctx, id, userEntry(actionRoleAssigned, targetID, target.FullName,
		map[string]any{"role": role.Code}))
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
	target, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
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
	s.Record(ctx, id, userEntry(actionRoleRemoved, targetID, target.FullName,
		map[string]any{"role": role.Code}))
	return nil
}

// ResetPassword mints a new temporary password for the target, revoking every
// live session so the new password is the only way back in, and returns the
// plaintext once. Rate-limited; target must be active. Requires users.update.
func (s *Service) ResetPassword(ctx context.Context, id *httpx.Identity, targetID uuid.UUID) (UserCredentials, error) {
	if err := s.Require(ctx, id, permUsersUpdate); err != nil {
		return UserCredentials{}, err
	}
	if err := s.Allow(ctx, "admin:reset:user:"+targetID.String(), rlResetPerTarget, rlResetWindow); err != nil {
		return UserCredentials{}, err
	}
	u, err := s.repo.GetUser(ctx, targetID)
	if errors.Is(err, shared.ErrNotFound) {
		return UserCredentials{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return UserCredentials{}, apperr.Internal()
	}
	if u.Status != statusActive {
		return UserCredentials{}, apperr.Conflict("conflict")
	}
	plain, hash, err := tempPassword()
	if err != nil {
		return UserCredentials{}, apperr.Internal()
	}
	if err := s.repo.SetPassword(ctx, targetID, hash, s.Now()); err != nil {
		s.Sec(ctx).Error("admin reset password", "err", err)
		return UserCredentials{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin reset password", "actor", id.UserID, "target", targetID)
	s.Record(ctx, id, userEntry(actionPasswordReset, targetID, u.FullName, nil))
	return s.withTempPassword(ctx, u, plain)
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
