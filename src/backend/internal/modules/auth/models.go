// Package auth implements authentication and the RBAC login flow: password
// login, 2FA (TOTP/recovery), refresh-token rotation with reuse detection,
// logout, current-user, and forgot/reset password. All security rules are
// enforced here in the service layer (docs/domains/auth/business-rules.md).
package auth

import (
	"time"

	"github.com/google/uuid"
)

// User is the auth view of a user account (includes security columns that are
// never serialized to clients).
type User struct {
	ID               uuid.UUID
	Email            string
	PasswordHash     string
	FullName         string
	AvatarPath       *string
	Status           string
	EmailVerifiedAt  *time.Time
	FailedLoginCount int
	LockedUntil      *time.Time
	LastLoginAt      *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

const (
	statusActive   = "active"
	statusDisabled = "disabled"
	statusLocked   = "locked"
)

// RecoveryCode is one stored 2FA recovery code (hash + single-use flag).
type RecoveryCode struct {
	Hash string `json:"hash"`
	Used bool   `json:"used"`
}

// TwoFactor is the TOTP enrollment row for a user (1–1).
type TwoFactor struct {
	UserID          uuid.UUID
	SecretEncrypted []byte
	RecoveryCodes   []RecoveryCode
	EnabledAt       *time.Time
	LastUsedStep    *int64
}

// Enabled reports whether 2FA is confirmed/active for this user.
func (t *TwoFactor) Enabled() bool { return t != nil && t.EnabledAt != nil }

// Session is a refresh-token session row (source of truth for rotation/revoke).
type Session struct {
	ID               uuid.UUID
	UserID           uuid.UUID
	RefreshTokenHash string
	UserAgent        *string
	IP               *string
	CreatedAt        time.Time
	LastUsedAt       *time.Time
	ExpiresAt        time.Time
	RevokedAt        *time.Time
}

// ResetToken is a password-reset token row (stored as hash, single-use).
type ResetToken struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	TokenHash   string
	ExpiresAt   time.Time
	UsedAt      *time.Time
	RequestedIP *string
	CreatedAt   time.Time
}

// --- Request DTOs (validated at the HTTP boundary) ---

// LoginRequest is the password step of login.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=1"`
}

// TwoFactorVerifyRequest is the second login step (TOTP or recovery code).
type TwoFactorVerifyRequest struct {
	ChallengeToken string `json:"challenge_token" validate:"required"`
	Code           string `json:"code" validate:"required"`
}

// ForgotPasswordRequest starts the reset flow.
type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// ResetPasswordRequest completes the reset flow.
type ResetPasswordRequest struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required"`
}

// --- Response DTOs ---

// UserResponse is the public, sanitized view of a user. It never exposes
// password_hash, failed_login_count, or locked_until.
type UserResponse struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	AvatarURL   *string    `json:"avatar_url"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// MeResponse is the current-user payload (profile + resolved authz).
type MeResponse struct {
	User        UserResponse `json:"user"`
	Roles       []string     `json:"roles"`
	Permissions []string     `json:"permissions"`
}

// LoginResult is the service-layer outcome of a login/verify/refresh. The
// handler decides how to render it (2FA challenge vs access body + cookie).
type LoginResult struct {
	TwoFactorRequired bool
	ChallengeToken    string

	AccessToken      string
	ExpiresIn        int
	User             UserResponse
	RefreshToken     string // raw; set as httpOnly cookie, never returned in body
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
