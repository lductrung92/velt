// Package token issues and verifies the stateless JWTs used by auth: the
// short-lived access token (carries resolved roles/permissions) and the 2FA
// challenge token (purpose-scoped, issued between password and TOTP steps).
// Refresh tokens are NOT JWTs — they are opaque random strings stored hashed
// in auth_sessions (see the auth module).
package token

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	purposeAccess = "access"
	purpose2FA    = "2fa_challenge"

	// tokenIssuer / tokenAudience are verified on every parse (defense in depth
	// against tokens minted for a different service sharing the secret).
	tokenIssuer   = "velt"
	tokenAudience = "velt-api"
)

// ErrInvalidToken is returned for any malformed, expired, wrong-purpose, or
// bad-signature token.
var ErrInvalidToken = errors.New("invalid token")

// Manager signs and verifies tokens with a single HMAC secret.
type Manager struct {
	secret       []byte
	accessTTL    time.Duration
	challengeTTL time.Duration
	now          func() time.Time
}

// NewManager builds a token manager. now defaults to time.Now when nil
// (injectable for deterministic tests).
func NewManager(secret string, accessTTL, challengeTTL time.Duration, now func() time.Time) *Manager {
	if now == nil {
		now = time.Now
	}
	return &Manager{secret: []byte(secret), accessTTL: accessTTL, challengeTTL: challengeTTL, now: now}
}

type accessClaims struct {
	Purpose     string   `json:"purpose"`
	Roles       []string `json:"roles"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

// NewAccess issues an access token embedding the caller's resolved roles and
// permissions (so per-request authorization never queries the DB). jti is a
// fresh random id for tracing.
func (m *Manager) NewAccess(userID uuid.UUID, roles, permissions []string) (string, error) {
	now := m.now()
	claims := accessClaims{
		Purpose:     purposeAccess,
		Roles:       roles,
		Permissions: permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tokenIssuer,
			Audience:  jwt.ClaimStrings{tokenAudience},
			Subject:   userID.String(),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// ParseAccess verifies an access token and returns its identity claims.
// Signature method is pinned to HS256 to prevent algorithm-confusion attacks.
func (m *Manager) ParseAccess(tokenStr string) (uuid.UUID, []string, []string, error) {
	var claims accessClaims
	if err := m.parse(tokenStr, &claims); err != nil {
		return uuid.Nil, nil, nil, err
	}
	if claims.Purpose != purposeAccess {
		return uuid.Nil, nil, nil, ErrInvalidToken
	}
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, nil, nil, ErrInvalidToken
	}
	return uid, claims.Roles, claims.Permissions, nil
}

type challengeClaims struct {
	Purpose string `json:"purpose"`
	jwt.RegisteredClaims
}

// New2FAChallenge issues a short-lived token that authorizes only the
// /2fa/verify step for the given pending user.
func (m *Manager) New2FAChallenge(userID uuid.UUID) (string, error) {
	now := m.now()
	claims := challengeClaims{
		Purpose: purpose2FA,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tokenIssuer,
			Audience:  jwt.ClaimStrings{tokenAudience},
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.challengeTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// Parse2FAChallenge verifies a challenge token (signature, expiry, purpose) and
// returns the pending user id.
func (m *Manager) Parse2FAChallenge(tokenStr string) (uuid.UUID, error) {
	var claims challengeClaims
	if err := m.parse(tokenStr, &claims); err != nil {
		return uuid.Nil, err
	}
	if claims.Purpose != purpose2FA {
		return uuid.Nil, ErrInvalidToken
	}
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	return uid, nil
}

func (m *Manager) parse(tokenStr string, claims jwt.Claims) error {
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(*jwt.Token) (any, error) {
		return m.secret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithTimeFunc(m.now),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithAudience(tokenAudience),
	)
	if err != nil {
		return ErrInvalidToken
	}
	return nil
}
