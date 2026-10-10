package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned by the repository when a row does not exist. The
// service translates it to the appropriate AppError (often a generic one, to
// avoid leaking existence).
var ErrNotFound = errors.New("not found")

// ErrSessionReused is returned by RotateSession when the session it was asked to
// rotate is already revoked — a concurrent rotation won the race, so this refresh
// is (from the token's point of view) a reuse. The service reacts with the theft
// response (revoke all of the user's sessions).
var ErrSessionReused = errors.New("session reused")

// ErrResetTokenUsed is returned by ResetPassword when the reset token was already
// consumed (concurrent reset) — enforces strict single-use.
var ErrResetTokenUsed = errors.New("reset token already used")

// Repository is the data-access contract for auth. Every method is one query
// or one transaction; no business rules live here. A fake implements this in
// tests; pgxRepository is the production implementation.
type Repository interface {
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)
	IncrementFailedLogin(ctx context.Context, userID uuid.UUID, lockedUntil *time.Time) error
	MarkLoginSuccess(ctx context.Context, userID uuid.UUID, at time.Time) error
	UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error

	GetTwoFactor(ctx context.Context, userID uuid.UUID) (*TwoFactor, error)
	// UpdateTwoFactorUsage compare-and-swaps the replay state: it only writes when
	// last_used_step + recovery_codes still match expectStep/expectCodes (the values
	// read before verifying), so two concurrent verifies of the same TOTP step or
	// recovery code can't both succeed. Returns whether the write applied.
	UpdateTwoFactorUsage(ctx context.Context, userID uuid.UUID, newStep *int64, newCodes []RecoveryCode, expectStep *int64, expectCodes []RecoveryCode) (bool, error)

	GetRolesAndPermissions(ctx context.Context, userID uuid.UUID) (roles, permissions []string, err error)

	CountActiveSessions(ctx context.Context, userID uuid.UUID, now time.Time) (int, error)
	RevokeOldestActiveSession(ctx context.Context, userID uuid.UUID, now time.Time) error
	CreateSession(ctx context.Context, s *Session) error
	GetSessionByRefreshHash(ctx context.Context, hash string) (*Session, error)
	RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error
	RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error
	RotateSession(ctx context.Context, oldID uuid.UUID, newSession *Session, at time.Time) error

	InvalidateUserResetTokens(ctx context.Context, userID uuid.UUID, at time.Time) error
	CreateResetToken(ctx context.Context, t *ResetToken) error
	GetResetTokenByHash(ctx context.Context, hash string) (*ResetToken, error)
	// ResetPassword atomically sets the new password, marks the token used, and
	// revokes all of the user's sessions.
	ResetPassword(ctx context.Context, userID uuid.UUID, passwordHash string, tokenID uuid.UUID, at time.Time) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const userColumns = `id, email, password_hash, full_name, avatar_path, status,
	email_verified_at, failed_login_count, locked_until, last_login_at, created_at, updated_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.AvatarPath, &u.Status,
		&u.EmailVerifiedAt, &u.FailedLoginCount, &u.LockedUntil, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &u, nil
}

func (r *pgxRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
}

func (r *pgxRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

func (r *pgxRepository) IncrementFailedLogin(ctx context.Context, userID uuid.UUID, lockedUntil *time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users
		   SET failed_login_count = failed_login_count + 1,
		       locked_until = COALESCE($2, locked_until),
		       updated_at = now()
		 WHERE id = $1`, userID, lockedUntil)
	return wrap("increment failed login", err)
}

func (r *pgxRepository) MarkLoginSuccess(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users
		   SET failed_login_count = 0, locked_until = NULL, last_login_at = $2, updated_at = now()
		 WHERE id = $1`, userID, at)
	return wrap("mark login success", err)
}

func (r *pgxRepository) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash)
	return wrap("update password", err)
}

func (r *pgxRepository) GetTwoFactor(ctx context.Context, userID uuid.UUID) (*TwoFactor, error) {
	var tf TwoFactor
	var codesRaw []byte
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, secret_encrypted, recovery_codes, enabled_at, last_used_step
		   FROM two_factor_secrets WHERE user_id = $1`, userID).
		Scan(&tf.UserID, &tf.SecretEncrypted, &codesRaw, &tf.EnabledAt, &tf.LastUsedStep)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan two_factor: %w", err)
	}
	if len(codesRaw) > 0 {
		if err := json.Unmarshal(codesRaw, &tf.RecoveryCodes); err != nil {
			return nil, fmt.Errorf("unmarshal recovery codes: %w", err)
		}
	}
	return &tf, nil
}

func (r *pgxRepository) UpdateTwoFactorUsage(ctx context.Context, userID uuid.UUID, newStep *int64, newCodes []RecoveryCode, expectStep *int64, expectCodes []RecoveryCode) (bool, error) {
	newRaw, err := json.Marshal(newCodes)
	if err != nil {
		return false, fmt.Errorf("marshal recovery codes: %w", err)
	}
	expRaw, err := json.Marshal(expectCodes)
	if err != nil {
		return false, fmt.Errorf("marshal recovery codes: %w", err)
	}
	// CAS: apply only if the replay state is unchanged since we read it. recovery_codes
	// is JSONB so `=` compares semantically (order-insensitive).
	ct, err := r.pool.Exec(ctx,
		`UPDATE two_factor_secrets
		   SET last_used_step = $2, recovery_codes = $3, updated_at = now()
		 WHERE user_id = $1
		   AND last_used_step IS NOT DISTINCT FROM $4
		   AND recovery_codes = $5`, userID, newStep, newRaw, expectStep, expRaw)
	if err != nil {
		return false, wrap("update two_factor usage", err)
	}
	return ct.RowsAffected() > 0, nil
}

func (r *pgxRepository) GetRolesAndPermissions(ctx context.Context, userID uuid.UUID) ([]string, []string, error) {
	roles, err := r.queryStrings(ctx,
		`SELECT r.code FROM user_roles ur
		   JOIN roles r ON r.id = ur.role_id
		  WHERE ur.user_id = $1 ORDER BY r.code`, userID)
	if err != nil {
		return nil, nil, err
	}
	perms, err := r.queryStrings(ctx,
		`SELECT DISTINCT p.code FROM user_roles ur
		   JOIN role_permissions rp ON rp.role_id = ur.role_id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE ur.user_id = $1 ORDER BY p.code`, userID)
	if err != nil {
		return nil, nil, err
	}
	return roles, perms, nil
}

func (r *pgxRepository) queryStrings(ctx context.Context, sql string, args ...any) ([]string, error) {
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query strings: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scan string: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *pgxRepository) CountActiveSessions(ctx context.Context, userID uuid.UUID, now time.Time) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM auth_sessions
		  WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2`, userID, now).Scan(&n)
	return n, wrap("count active sessions", err)
}

func (r *pgxRepository) RevokeOldestActiveSession(ctx context.Context, userID uuid.UUID, now time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = $2
		  WHERE id = (
		      SELECT id FROM auth_sessions
		       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
		       ORDER BY created_at ASC LIMIT 1
		  )`, userID, now)
	return wrap("revoke oldest session", err)
}

func (r *pgxRepository) CreateSession(ctx context.Context, s *Session) error {
	return insertSession(ctx, r.pool, s)
}

func (r *pgxRepository) GetSessionByRefreshHash(ctx context.Context, hash string) (*Session, error) {
	var s Session
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, refresh_token_hash, user_agent, ip::text,
		        created_at, last_used_at, expires_at, revoked_at
		   FROM auth_sessions WHERE refresh_token_hash = $1`, hash).
		Scan(&s.ID, &s.UserID, &s.RefreshTokenHash, &s.UserAgent, &s.IP,
			&s.CreatedAt, &s.LastUsedAt, &s.ExpiresAt, &s.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan session: %w", err)
	}
	return &s, nil
}

func (r *pgxRepository) RevokeSession(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`, id, at)
	return wrap("revoke session", err)
}

func (r *pgxRepository) RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, userID, at)
	return wrap("revoke all sessions", err)
}

func (r *pgxRepository) RotateSession(ctx context.Context, oldID uuid.UUID, newSession *Session, at time.Time) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = $2, last_used_at = $2 WHERE id = $1 AND revoked_at IS NULL`, oldID, at)
		if err != nil {
			return fmt.Errorf("revoke old session: %w", err)
		}
		if ct.RowsAffected() == 0 {
			// A concurrent Refresh already rotated (revoked) this session → reuse.
			return ErrSessionReused
		}
		return insertSession(ctx, tx, newSession)
	})
}

func (r *pgxRepository) InvalidateUserResetTokens(ctx context.Context, userID uuid.UUID, at time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used_at = $2
		  WHERE user_id = $1 AND used_at IS NULL`, userID, at)
	return wrap("invalidate reset tokens", err)
}

func (r *pgxRepository) CreateResetToken(ctx context.Context, t *ResetToken) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, requested_ip, created_at)
		 VALUES ($1, $2, $3, $4, $5::inet, $6)`,
		t.ID, t.UserID, t.TokenHash, t.ExpiresAt, t.RequestedIP, t.CreatedAt)
	return wrap("create reset token", err)
}

func (r *pgxRepository) GetResetTokenByHash(ctx context.Context, hash string) (*ResetToken, error) {
	var t ResetToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, expires_at, used_at, created_at
		   FROM password_reset_tokens WHERE token_hash = $1`, hash).
		Scan(&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan reset token: %w", err)
	}
	return &t, nil
}

func (r *pgxRepository) ResetPassword(ctx context.Context, userID uuid.UUID, passwordHash string, tokenID uuid.UUID, at time.Time) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash); err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		ct, err := tx.Exec(ctx,
			`UPDATE password_reset_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL`, tokenID, at)
		if err != nil {
			return fmt.Errorf("mark token used: %w", err)
		}
		if ct.RowsAffected() == 0 {
			// Concurrent reset already consumed the token → enforce single-use.
			return ErrResetTokenUsed
		}
		if _, err := tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, userID, at); err != nil {
			return fmt.Errorf("revoke sessions: %w", err)
		}
		return nil
	})
}

// execer is satisfied by both *pgxpool.Pool and pgx.Tx, so insertSession works
// inside or outside a transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func insertSession(ctx context.Context, q execer, s *Session) error {
	_, err := q.Exec(ctx,
		`INSERT INTO auth_sessions
		     (id, user_id, refresh_token_hash, user_agent, ip, created_at, last_used_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5::inet, $6, $7, $8)`,
		s.ID, s.UserID, s.RefreshTokenHash, s.UserAgent, s.IP, s.CreatedAt, s.LastUsedAt, s.ExpiresAt)
	return wrap("insert session", err)
}

func wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}
