// Package users is the admin user-management feature: list/get/create/update/
// delete users, role assignment, and admin-triggered password reset. Every
// action is permission-gated and subject to anti-escalation + self-protection
// (enforced via the shared Base).
package users

import (
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/admin/shared"
)

const (
	statusActive   = "active"
	statusDisabled = "disabled"
	roleEditor     = "editor"

	permUsersRead   = "users.read"
	permUsersCreate = "users.create"
	permUsersUpdate = "users.update"
	permUsersDelete = "users.delete"
	permUsersAssign = "users.assign_role"
)

// User is the admin view of a user row.
type User struct {
	ID          uuid.UUID
	Email       string
	FullName    string
	AvatarPath  *string
	Status      string
	CreatedAt   time.Time
	LastLoginAt *time.Time
}

// CreateUserRequest creates a user (no password; a set-password mail is sent).
type CreateUserRequest struct {
	Email    string      `json:"email" validate:"required,email"`
	FullName string      `json:"full_name" validate:"required"`
	RoleIDs  []uuid.UUID `json:"role_ids"`
}

// UpdateUserRequest edits full_name and/or status, and (super_admin only)
// replaces the user's single role via role_id.
type UpdateUserRequest struct {
	FullName *string    `json:"full_name"`
	Status   *string    `json:"status" validate:"omitempty,oneof=active disabled"`
	RoleID   *uuid.UUID `json:"role_id"`
}

// AssignRoleRequest assigns a role to a user.
type AssignRoleRequest struct {
	RoleID uuid.UUID `json:"role_id" validate:"required"`
}

// UserResponse is the sanitized user view (no password_hash/secret).
type UserResponse struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	AvatarURL   *string    `json:"avatar_url"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// UserDetail is UserResponse plus roles and 2FA status.
type UserDetail struct {
	UserResponse
	Roles            []shared.RoleSummary `json:"roles"`
	TwoFactorEnabled bool                 `json:"two_factor_enabled"`
}

// ListUsersFilter parameterizes the user list query.
type ListUsersFilter struct {
	Query    string
	Status   string
	Page     int
	PageSize int
	Sort     string
}

func toUserResponse(u *User, avatarURL *string) UserResponse {
	return UserResponse{
		ID: u.ID, Email: u.Email, FullName: u.FullName, AvatarURL: avatarURL,
		Status: u.Status, CreatedAt: u.CreatedAt, LastLoginAt: u.LastLoginAt,
	}
}

// nonNilRoles guarantees a non-nil slice so the JSON renders `[]`, not `null`.
func nonNilRoles(r []shared.RoleSummary) []shared.RoleSummary {
	if r == nil {
		return []shared.RoleSummary{}
	}
	return r
}
