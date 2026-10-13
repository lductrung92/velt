// Package sessions is the admin session-control feature: list sessions (global or
// per-user), revoke one session, revoke all of a user's sessions. The last
// active-super-admin's sessions are flagged (soft warning, not a hard block).
package sessions

import (
	"time"

	"github.com/google/uuid"
)

const (
	permRead = "sessions.read"
	permKill = "sessions.revoke"
)

// SessionResponse is one session with its owner resolved.
type SessionResponse struct {
	ID               uuid.UUID  `json:"id"`
	UserID           uuid.UUID  `json:"user_id"`
	FullName         string     `json:"full_name"`
	Email            string     `json:"email"`
	UserAgent        *string    `json:"user_agent"`
	IP               *string    `json:"ip"`
	CreatedAt        time.Time  `json:"created_at"`
	LastUsedAt       *time.Time `json:"last_used_at"`
	ExpiresAt        time.Time  `json:"expires_at"`
	Current          bool       `json:"current"`
	IsLastSuperAdmin bool       `json:"is_last_super_admin"`
}

// ListFilter parameterizes the session list query.
type ListFilter struct {
	UserID   *uuid.UUID
	Active   bool
	Page     int
	PageSize int
}
