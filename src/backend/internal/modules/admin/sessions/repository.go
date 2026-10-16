package sessions

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Repository is the data-access contract for session control.
type Repository interface {
	ListSessions(ctx context.Context, f ListFilter, now time.Time) ([]SessionResponse, int, error)
	GetSessionUser(ctx context.Context, id uuid.UUID) (uuid.UUID, error)
	// UserLabel is the account holder's name, for the activity log: a session
	// has no name of its own, so its owner is what a reader can recognise.
	UserLabel(ctx context.Context, id uuid.UUID) (string, error)
	RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error
	RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error
	UserExists(ctx context.Context, id uuid.UUID) (bool, error)
	// PurgeSessions deletes sessions created before the cutoff, skipping
	// keepUser's own — see Service.PurgeSessions.
	PurgeSessions(ctx context.Context, before time.Time, keepUser uuid.UUID) (int64, error)
}

// querier is the slice of pgx both *pgxpool.Pool and pgx.Tx satisfy. The
// repository takes it rather than the pool so the integration test for
// PurgeSessions can run inside a transaction it rolls back — a DELETE
// statement is not something to try out against a live table.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type pgxRepository struct {
	pool querier
}

// NewRepository builds the pgx-backed session repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func (r *pgxRepository) ListSessions(ctx context.Context, f ListFilter, now time.Time) ([]SessionResponse, int, error) {
	page, pageSize := shared.NormalizePage(f.Page, f.PageSize)
	conds := []string{"TRUE"}
	args := []any{}
	if f.UserID != nil {
		args = append(args, *f.UserID)
		conds = append(conds, fmt.Sprintf("s.user_id = $%d", len(args)))
	}
	if f.Active {
		args = append(args, now)
		conds = append(conds, fmt.Sprintf("(s.revoked_at IS NULL AND s.expires_at > $%d)", len(args)))
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM auth_sessions s WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count sessions: %w", err)
	}

	args = append(args, pageSize, (page-1)*pageSize)
	q := fmt.Sprintf(
		`SELECT s.id, s.user_id, u.full_name, u.email, s.user_agent, s.ip::text,
		        s.created_at, s.last_used_at, s.expires_at
		   FROM auth_sessions s JOIN users u ON u.id = s.user_id
		  WHERE %s ORDER BY s.created_at DESC LIMIT $%d OFFSET $%d`,
		where, len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	var out []SessionResponse
	for rows.Next() {
		var s SessionResponse
		if err := rows.Scan(&s.ID, &s.UserID, &s.FullName, &s.Email, &s.UserAgent, &s.IP,
			&s.CreatedAt, &s.LastUsedAt, &s.ExpiresAt); err != nil {
			return nil, 0, fmt.Errorf("scan session: %w", err)
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) GetSessionUser(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	var uid uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT user_id FROM auth_sessions WHERE id = $1`, id).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, shared.ErrNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("get session user: %w", err)
	}
	return uid, nil
}

func (r *pgxRepository) UserLabel(ctx context.Context, id uuid.UUID) (string, error) {
	var name string
	err := r.pool.QueryRow(ctx, `SELECT full_name FROM users WHERE id = $1`, id).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", shared.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("user label: %w", err)
	}
	return name, nil
}

func (r *pgxRepository) RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, id, at)
	return shared.Wrap("revoke session", err)
}

func (r *pgxRepository) RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, userID, at)
	return shared.Wrap("revoke all sessions", err)
}

func (r *pgxRepository) UserExists(ctx context.Context, id uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)`, id).Scan(&exists)
	return exists, shared.Wrap("user exists", err)
}

// PurgeSessions deletes sessions created BEFORE the cutoff, keeping the rest.
// A zero cutoff has no lower bound and clears everything that is left.
//
// keepUser's rows are never touched: the acting admin is holding one of them,
// and the request that signs its own caller out is not a clean-up.
func (r *pgxRepository) PurgeSessions(ctx context.Context, before time.Time, keepUser uuid.UUID) (int64, error) {
	q := `DELETE FROM auth_sessions WHERE user_id <> $1`
	args := []any{keepUser}
	if !before.IsZero() {
		q += ` AND created_at < $2`
		args = append(args, before)
	}
	tag, err := r.pool.Exec(ctx, q, args...)
	if err != nil {
		return 0, fmt.Errorf("purge sessions: %w", err)
	}
	return tag.RowsAffected(), nil
}
