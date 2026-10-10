package roles

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/admin/shared"
)

// Service holds role-management business logic.
type Service struct {
	*shared.Base
	repo Repository
}

// NewService wires the roles service onto the shared admin base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListRoles returns all roles (system + custom) with counts. Requires roles.read.
func (s *Service) ListRoles(ctx context.Context, id *httpx.Identity) ([]RoleResponse, error) {
	if err := s.Require(ctx, id, permRolesRead); err != nil {
		return nil, err
	}
	roles, err := s.repo.ListRoles(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	return roles, nil
}

// GetRole returns a role with its full permission list. Requires roles.read.
func (s *Service) GetRole(ctx context.Context, id *httpx.Identity, roleID uuid.UUID) (RoleResponse, error) {
	if err := s.Require(ctx, id, permRolesRead); err != nil {
		return RoleResponse{}, err
	}
	role, err := s.Base.GetRole(ctx, roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return RoleResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	return s.roleDetail(ctx, role)
}

// ListRoleMembers returns a paginated page of a role's members. Requires roles.read.
func (s *Service) ListRoleMembers(ctx context.Context, id *httpx.Identity, roleID uuid.UUID, page, pageSize int) (shared.Page[RoleMember], error) {
	if err := s.Require(ctx, id, permRolesRead); err != nil {
		return shared.Page[RoleMember]{}, err
	}
	if _, err := s.Base.GetRole(ctx, roleID); errors.Is(err, shared.ErrNotFound) {
		return shared.Page[RoleMember]{}, apperr.NotFound("not_found")
	} else if err != nil {
		return shared.Page[RoleMember]{}, apperr.Internal()
	}
	page, pageSize = shared.NormalizePage(page, pageSize)
	members, total, err := s.repo.ListRoleMembers(ctx, roleID, page, pageSize)
	if err != nil {
		return shared.Page[RoleMember]{}, apperr.Internal()
	}
	return shared.Page[RoleMember]{Items: members, Total: total, Page: page, PageSize: pageSize}, nil
}

// CreateRole creates a custom role with a permission set ⊆ actor's effective
// permissions. Requires roles.manage.
func (s *Service) CreateRole(ctx context.Context, id *httpx.Identity, req CreateRoleRequest) (RoleResponse, error) {
	if err := s.Require(ctx, id, permRolesManage); err != nil {
		return RoleResponse{}, err
	}
	if err := s.AssertCanGrantPermissions(ctx, id.UserID, req.PermissionIDs); err != nil {
		return RoleResponse{}, err
	}
	if _, err := s.GetRoleByCode(ctx, req.Code); err == nil {
		return RoleResponse{}, apperr.Conflict("conflict")
	} else if !errors.Is(err, shared.ErrNotFound) {
		return RoleResponse{}, apperr.Internal()
	}
	role, err := s.repo.CreateRole(ctx, req.Code, req.Name, req.Description, shared.DedupeIDs(req.PermissionIDs))
	if errors.Is(err, shared.ErrConflict) {
		return RoleResponse{}, apperr.Conflict("conflict")
	}
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin created role", "actor", id.UserID, "role", role.ID)
	return s.roleDetail(ctx, role)
}

// UpdateRole edits role metadata (optimistic-locked). System roles are read-only.
// Requires roles.manage.
func (s *Service) UpdateRole(ctx context.Context, id *httpx.Identity, roleID uuid.UUID, req UpdateRoleRequest) (RoleResponse, error) {
	if err := s.Require(ctx, id, permRolesManage); err != nil {
		return RoleResponse{}, err
	}
	role, err := s.Base.GetRole(ctx, roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return RoleResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	if role.IsSystem {
		return RoleResponse{}, apperr.Conflict("system_role_locked")
	}
	name := role.Name
	if req.Name != nil {
		name = *req.Name
	}
	desc := role.Description
	if req.Description != nil {
		desc = req.Description
	}
	if _, err := s.repo.UpdateRoleMeta(ctx, roleID, name, desc, req.UpdatedAt); errors.Is(err, shared.ErrConflict) {
		return RoleResponse{}, apperr.Conflict("conflict")
	} else if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin updated role", "actor", id.UserID, "role", roleID)
	updated, err := s.Base.GetRole(ctx, roleID)
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	return s.roleDetail(ctx, updated)
}

// ReplaceRolePermissions overwrites a role's permissions (subset-checked,
// optimistic-locked). System roles are read-only. Requires roles.manage.
func (s *Service) ReplaceRolePermissions(ctx context.Context, id *httpx.Identity, roleID uuid.UUID, req ReplaceRolePermissionsRequest) (RoleResponse, error) {
	if err := s.Require(ctx, id, permRolesManage); err != nil {
		return RoleResponse{}, err
	}
	role, err := s.Base.GetRole(ctx, roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return RoleResponse{}, apperr.NotFound("not_found")
	}
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	if role.IsSystem {
		return RoleResponse{}, apperr.Conflict("system_role_locked")
	}
	if err := s.AssertCanGrantPermissions(ctx, id.UserID, req.PermissionIDs); err != nil {
		return RoleResponse{}, err
	}
	if _, err := s.repo.ReplaceRolePermissions(ctx, roleID, shared.DedupeIDs(req.PermissionIDs), req.UpdatedAt); errors.Is(err, shared.ErrConflict) {
		return RoleResponse{}, apperr.Conflict("conflict")
	} else if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("admin set role permissions", "actor", id.UserID, "role", roleID)
	updated, err := s.Base.GetRole(ctx, roleID)
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	return s.roleDetail(ctx, updated)
}

// DeleteRole removes a custom role with no members. System roles are locked.
// Requires roles.manage.
func (s *Service) DeleteRole(ctx context.Context, id *httpx.Identity, roleID uuid.UUID) error {
	if err := s.Require(ctx, id, permRolesManage); err != nil {
		return err
	}
	role, err := s.Base.GetRole(ctx, roleID)
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	if err != nil {
		return apperr.Internal()
	}
	if role.IsSystem {
		return apperr.Conflict("system_role_locked")
	}
	n, err := s.repo.CountRoleMembers(ctx, roleID)
	if err != nil {
		return apperr.Internal()
	}
	if n > 0 {
		return apperr.Conflict("role_in_use")
	}
	if err := s.repo.DeleteRole(ctx, roleID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("admin deleted role", "actor", id.UserID, "role", roleID)
	return nil
}

// ListPermissions returns the read-only catalog grouped by resource. Requires
// permissions.read.
func (s *Service) ListPermissions(ctx context.Context, id *httpx.Identity) ([]PermissionGroup, error) {
	if err := s.Require(ctx, id, permPermsRead); err != nil {
		return nil, err
	}
	items, err := s.repo.ListPermissions(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	groups := []PermissionGroup{}
	index := map[string]int{}
	for _, it := range items {
		resource := it.Code
		if i := strings.IndexByte(it.Code, '.'); i >= 0 {
			resource = it.Code[:i]
		}
		gi, ok := index[resource]
		if !ok {
			gi = len(groups)
			index[resource] = gi
			groups = append(groups, PermissionGroup{Resource: resource})
		}
		groups[gi].Permissions = append(groups[gi].Permissions, it)
	}
	return groups, nil
}

func (s *Service) roleDetail(ctx context.Context, role *shared.Role) (RoleResponse, error) {
	codes, err := s.RolePermissionCodes(ctx, role.ID)
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	members, err := s.repo.CountRoleMembers(ctx, role.ID)
	if err != nil {
		return RoleResponse{}, apperr.Internal()
	}
	if codes == nil {
		codes = []string{}
	}
	return RoleResponse{
		ID: role.ID, Code: role.Code, Name: role.Name, Description: role.Description,
		IsSystem: role.IsSystem, MemberCount: members, PermissionCount: len(codes),
		UpdatedAt: role.UpdatedAt, Permissions: codes,
	}, nil
}
