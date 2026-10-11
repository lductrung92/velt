package members

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// Sentinel errors returned by the repository and mapped to AppErrors by the
// service. Each bounded context keeps its own set (cms/shared and admin/shared
// do the same) so no context has to import another's spine.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict") // unique violation (slug taken)
)

// wrap annotates a non-nil error with an operation label (%w-wrapped), nil-safe.
func wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}

// isUniqueViolation reports a Postgres 23505 unique-constraint violation.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
