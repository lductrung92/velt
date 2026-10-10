// Package account implements self-service: the authenticated user manages their
// OWN profile, password, avatar, and 2FA. Ownership is always self
// (ctx.user_id) — no user_id is ever taken from the client (no IDOR) and no
// users.* permission is required. See docs/domains/account/.
package account

import (
	"time"

	"github.com/google/uuid"
	"github.com/velt/backend/internal/platform/totp"
)

// User is the account view of the caller's own row.
type User struct {
	ID           uuid.UUID
	Email        string
	FullName     string
	AvatarPath   *string
	PasswordHash string
	Status       string
	CreatedAt    time.Time
	LastLoginAt  *time.Time
}

// TwoFactor is the caller's TOTP enrollment row.
type TwoFactor struct {
	UserID          uuid.UUID
	SecretEncrypted []byte
	RecoveryCodes   []totp.RecoveryCode
	EnabledAt       *time.Time
	LastUsedStep    *int64
}

// Enabled reports whether 2FA is confirmed/active.
func (t *TwoFactor) Enabled() bool { return t != nil && t.EnabledAt != nil }

// UnusedRecoveryCount returns how many recovery codes remain unused.
func (t *TwoFactor) UnusedRecoveryCount() int {
	n := 0
	for _, c := range t.RecoveryCodes {
		if !c.Used {
			n++
		}
	}
	return n
}

// Session is a new refresh session created after a password change.
type Session struct {
	ID               uuid.UUID
	UserID           uuid.UUID
	RefreshTokenHash string
	UserAgent        *string
	IP               *string
	CreatedAt        time.Time
	ExpiresAt        time.Time
}

// --- Request DTOs ---

// UpdateProfileRequest changes the caller's display name.
type UpdateProfileRequest struct {
	FullName string `json:"full_name" validate:"required"`
}

// ChangePasswordRequest changes the caller's password (re-auth via current).
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required"`
}

// Enable2FARequest confirms 2FA enrollment with a TOTP code.
type Enable2FARequest struct {
	Code string `json:"code" validate:"required"`
}

// Password2FARequest re-authenticates a sensitive 2FA action (disable/regenerate).
type Password2FARequest struct {
	Password string `json:"password" validate:"required"`
}

// --- Response DTOs ---

// UserResponse is the sanitized public view of the caller (no secrets/hashes).
type UserResponse struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	AvatarURL   *string    `json:"avatar_url"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// ProfileResponse is GET /api/account/profile.
type ProfileResponse struct {
	User                   UserResponse `json:"user"`
	TwoFactorEnabled       bool         `json:"two_factor_enabled"`
	RecoveryCodesRemaining *int         `json:"recovery_codes_remaining"`
}

// SetupResult is the 2FA setup payload (pending secret + QR for enrollment).
type SetupResult struct {
	OtpauthURL string `json:"otpauth_url"`
	QRSVG      string `json:"qr_svg"`
	ManualKey  string `json:"manual_key"`
}

// ChangePasswordResult carries the rotated tokens after a password change.
type ChangePasswordResult struct {
	AccessToken      string
	ExpiresIn        int
	RefreshToken     string // raw; set as the new httpOnly cookie
	RefreshExpiresAt time.Time
}

// RequestMeta carries non-secret request context for session bookkeeping.
type RequestMeta struct {
	IP        string
	UserAgent string
}

func toUserResponse(u *User, avatarURL *string) UserResponse {
	return UserResponse{
		ID:          u.ID,
		Email:       u.Email,
		FullName:    u.FullName,
		AvatarURL:   avatarURL,
		Status:      u.Status,
		CreatedAt:   u.CreatedAt,
		LastLoginAt: u.LastLoginAt,
	}
}
