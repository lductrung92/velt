package ai

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/platform/crypto"
)

// passwordPort re-checks the signed-in operator's own password before the
// endpoints module hands back a stored API key.
//
// It reads the hash live rather than trusting anything carried in the
// session: the point of asking again is to prove the person is still there,
// and a session that was issued an hour ago proves only that they were.
type passwordPort struct {
	pool *pgxpool.Pool
}

// Verify reports whether the password belongs to this user. A suspended
// account never matches, whatever it types: the session may still be valid
// but the account is not.
func (p passwordPort) Verify(ctx context.Context, userID uuid.UUID, password string) (bool, error) {
	var hash, status string
	err := p.pool.QueryRow(ctx,
		`SELECT password_hash, status FROM users WHERE id = $1`, userID).
		Scan(&hash, &status)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	if status != "active" {
		return false, nil
	}
	ok, err := crypto.VerifyPassword(password, hash)
	if err != nil {
		return false, err
	}
	return ok, nil
}
