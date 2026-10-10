package token

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	purposeCustomerAccess = "customer_access"

	// customerAudience scopes customer tokens to the public customer API. It is
	// verified on every parse so a staff token (aud=velt-api) is rejected here
	// and vice versa — independently of the separate signing secret below.
	customerAudience = "velt-customer"
)

// CustomerManager signs and verifies customer access tokens. It is deliberately
// SEPARATE from Manager and uses an independent HMAC secret: a leaked staff
// secret cannot forge customer tokens (blast-radius isolation). Customer tokens
// carry no roles/permissions — customers have no RBAC; product access is gated
// by subscription entitlement, not identity.
type CustomerManager struct {
	secret    []byte
	accessTTL time.Duration
	now       func() time.Time
}

// NewCustomerManager builds a customer token manager. now defaults to time.Now
// when nil (injectable for deterministic tests).
func NewCustomerManager(secret string, accessTTL time.Duration, now func() time.Time) *CustomerManager {
	if now == nil {
		now = time.Now
	}
	return &CustomerManager{secret: []byte(secret), accessTTL: accessTTL, now: now}
}

type customerClaims struct {
	Purpose string `json:"purpose"`
	jwt.RegisteredClaims
}

// NewCustomerAccess issues a short-lived access token for a customer. The
// subject is the customer id; there are no roles/permissions.
func (m *CustomerManager) NewCustomerAccess(customerID uuid.UUID) (string, error) {
	now := m.now()
	claims := customerClaims{
		Purpose: purposeCustomerAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tokenIssuer,
			Audience:  jwt.ClaimStrings{customerAudience},
			Subject:   customerID.String(),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// ParseCustomerAccess verifies a customer access token (signature, expiry,
// issuer, audience, purpose) and returns the customer id. Signature method is
// pinned to HS256 to prevent algorithm-confusion attacks.
func (m *CustomerManager) ParseCustomerAccess(tokenStr string) (uuid.UUID, error) {
	var claims customerClaims
	_, err := jwt.ParseWithClaims(tokenStr, &claims, func(*jwt.Token) (any, error) {
		return m.secret, nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithTimeFunc(m.now),
		jwt.WithIssuer(tokenIssuer),
		jwt.WithAudience(customerAudience),
	)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	if claims.Purpose != purposeCustomerAccess {
		return uuid.Nil, ErrInvalidToken
	}
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	return uid, nil
}
