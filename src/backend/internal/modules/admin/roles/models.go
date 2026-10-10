// Package roles is the admin RBAC role-management feature: list/get roles, role
// members, create/update/delete custom roles, replace role permissions, and the
// read-only permission catalog. Anti-escalation (subset checks) is enforced via
// the shared Base; system roles are read-only.
package roles

import (
	"time"

	"github.com/google/uuid"
)

const (
	permRolesRead   = "roles.read"
	permRolesManage = "roles.manage"
	permPermsRead   = "permissions.read"
)

// CreateRoleRequest creates a custom role.
type CreateRoleRequest struct {
	Code          string      `json:"code" validate:"required,max=64"`
	Name          string      `json:"name" validate:"required,max=120"`
	Description   *string     `json:"description" validate:"omitempty,max=500"`
	PermissionIDs []uuid.UUID `json:"permission_ids"`
}

// UpdateRoleRequest edits role metadata (optimistic-locked via updated_at).
type UpdateRoleRequest struct {
	Name        *string   `json:"name" validate:"omitempty,max=120"`
	Description *string   `json:"description" validate:"omitempty,max=500"`
	UpdatedAt   time.Time `json:"updated_at" validate:"required"`
}

// ReplaceRolePermissionsRequest overwrites a role's permissions (optimistic-locked).
type ReplaceRolePermissionsRequest struct {
	PermissionIDs []uuid.UUID `json:"permission_ids"`
	UpdatedAt     time.Time   `json:"updated_at" validate:"required"`
}

// RoleResponse is a role with counts; Permissions is included on detail only.
type RoleResponse struct {
	ID              uuid.UUID `json:"id"`
	Code            string    `json:"code"`
	Name            string    `json:"name"`
	Description     *string   `json:"description"`
	IsSystem        bool      `json:"is_system"`
	MemberCount     int       `json:"member_count"`
	PermissionCount int       `json:"permission_count"`
	UpdatedAt       time.Time `json:"updated_at"`
	Permissions     []string  `json:"permissions,omitempty"`
}

// RoleMember is one member of a role.
type RoleMember struct {
	UserID     uuid.UUID `json:"user_id"`
	FullName   string    `json:"full_name"`
	Email      string    `json:"email"`
	AssignedAt time.Time `json:"assigned_at"`
}

// PermissionItem is one catalog entry.
type PermissionItem struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Description *string   `json:"description"`
}

// PermissionGroup groups catalog entries by resource.
type PermissionGroup struct {
	Resource    string           `json:"resource"`
	Permissions []PermissionItem `json:"permissions"`
}
