// Package shared holds the cross-feature spine of the cms bounded context:
// sentinel errors, settings access, the Base service, and HTTP helpers. It
// imports no sibling feature package (the dependency graph is feature → shared,
// never feature → feature).
package shared

import (
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// Sentinel errors returned by feature repositories and mapped to AppErrors by
// the feature services.
var (
	ErrNotFound       = errors.New("not found")
	ErrConflict       = errors.New("conflict")        // unique violation (slug taken)
	ErrInUse          = errors.New("in use")          // FK RESTRICT / referenced rows
	ErrParentMissing  = errors.New("parent missing")  // FK violation on parent_id (race)
	ErrLandingMissing = errors.New("landing missing") // FK violation on landing_id (race)
	ErrInvalidStatus  = errors.New("invalid status")  // transition from a wrong state
	ErrOptLock        = errors.New("optimistic lock") // updated_at mismatch on PATCH
	ErrPageCycle      = errors.New("page cycle")      // move would create a parent cycle
	ErrCategoryCycle  = errors.New("category cycle")  // move would create a parent cycle
)

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

// IsForeignKeyViolation reports a Postgres 23503 foreign-key violation.
func IsForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// FKConstraintContains reports a 23503 FK violation whose constraint name
// contains substr — used to map the failure to the right request field
// (cms_pages has both parent_id and landing_id FKs).
func FKConstraintContains(err error, substr string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503" && strings.Contains(pgErr.ConstraintName, substr)
}
