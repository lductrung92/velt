// Package shared holds the cross-feature spine of the admin bounded context: the
// RBAC anti-escalation / self-protection helpers (Base), the spine repo for the
// cross-cutting RBAC queries, shared DTOs (Page, RoleSummary, Role), and HTTP
// helpers. Feature sub-packages (users, roles, sessions) embed *Base and add
// their own feature repository.
package shared

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// Sentinel errors translated to AppErrors by the feature services.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict") // unique violation / optimistic-lock mismatch
)

// Cross-feature constants.
const (
	RoleSuperAdmin = "super_admin"
	PermWildcard   = "*"

	defaultPageSize = 20
	maxPageSize     = 100
)

// Page is a generic paginated response.
type Page[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

// Role is a role row (returned by the spine for anti-escalation checks).
type Role struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Description *string
	IsSystem    bool
	UpdatedAt   time.Time
}

// RoleSummary is a compact role reference embedded in user responses.
type RoleSummary struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
	Name string    `json:"name"`
}

// NormalizePage clamps page/page_size to sane bounds.
func NormalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

// Wrap annotates a non-nil error with an operation label (%w-wrapped), nil-safe.
func Wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}

// IsUniqueViolation reports a Postgres 23505 unique-constraint violation.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// NullableUUID returns nil (SQL NULL) for the zero UUID, else the id.
func NullableUUID(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

// DedupeIDs removes duplicate UUIDs, preserving order.
func DedupeIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]bool, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
