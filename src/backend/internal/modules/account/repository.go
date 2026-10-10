package account

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/velt/backend/internal/platform/totp"
)

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("not found")

// Repository is the data-access contract for account. Every access is scoped to
// the caller's own id (passed by the service from ctx) — no client-supplied id.
type Repository interface {
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)
	UpdateFullName(ctx context.Context, id uuid.UUID, fullName string) error
	UpdateAvatarPath(ctx context.Context, id uuid.UUID, path *string) error

	GetTwoFactor(ctx context.Context, id uuid.UUID) (*TwoFactor, error)
	UpsertPendingSecret(ctx context.Context, id uuid.UUID, encrypted []byte) error
	EnableTwoFactor(ctx context.Context, id uuid.UUID, codes []totp.RecoveryCode, enabledAt time.Time, lastStep int64) error
	UpdateRecoveryCodes(ctx context.Context, id uuid.UUID, codes []totp.RecoveryCode) error
	DeleteTwoFactor(ctx context.Context, id uuid.UUID) error

	// ApplyPasswordChange atomically sets the new password, revokes ALL of the
	// user's sessions, and inserts a fresh session for the current device.
	ApplyPasswordChange(ctx context.Context, id uuid.UUID, passwordHash string, at time.Time, newSession *Session) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed account repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func (r *pgxRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, full_name, avatar_path, password_hash, status, created_at, last_login_at
		   FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.FullName, &u.AvatarPath, &u.PasswordHash, &u.Status, &u.CreatedAt, &u.LastLoginAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &u, nil
}

func (r *pgxRepository) UpdateFullName(ctx context.Context, id uuid.UUID, fullName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1`, id, fullName)
	return wrap("update full_name", err)
}

func (r *pgxRepository) UpdateAvatarPath(ctx context.Context, id uuid.UUID, path *string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET avatar_path = $2, updated_at = now() WHERE id = $1`, id, path)
	return wrap("update avatar_path", err)
}

func (r *pgxRepository) GetTwoFactor(ctx context.Context, id uuid.UUID) (*TwoFactor, error) {
	var tf TwoFactor
	var codesRaw []byte
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, secret_encrypted, recovery_codes, enabled_at, last_used_step
		   FROM two_factor_secrets WHERE user_id = $1`, id).
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

func (r *pgxRepository) UpsertPendingSecret(ctx context.Context, id uuid.UUID, encrypted []byte) error {
	// New pending secret resets enabled_at + recovery + last_used_step so a stale
	// replay step from a prior secret can't reject a valid new code.
	_, err := r.pool.Exec(ctx,
		`INSERT INTO two_factor_secrets (user_id, secret_encrypted, recovery_codes, enabled_at, last_used_step, updated_at)
		 VALUES ($1, $2, '[]'::jsonb, NULL, NULL, now())
		 ON CONFLICT (user_id) DO UPDATE
		   SET secret_encrypted = EXCLUDED.secret_encrypted, recovery_codes = '[]'::jsonb,
		       enabled_at = NULL, last_used_step = NULL, updated_at = now()`,
		id, encrypted)
	return wrap("upsert pending secret", err)
}

func (r *pgxRepository) EnableTwoFactor(ctx context.Context, id uuid.UUID, codes []totp.RecoveryCode, enabledAt time.Time, lastStep int64) error {
	raw, err := json.Marshal(codes)
	if err != nil {
		return fmt.Errorf("marshal recovery codes: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE two_factor_secrets
		   SET enabled_at = $2, recovery_codes = $3, last_used_step = $4, updated_at = now()
		 WHERE user_id = $1`, id, enabledAt, raw, lastStep)
	return wrap("enable two_factor", err)
}

func (r *pgxRepository) UpdateRecoveryCodes(ctx context.Context, id uuid.UUID, codes []totp.RecoveryCode) error {
	raw, err := json.Marshal(codes)
	if err != nil {
		return fmt.Errorf("marshal recovery codes: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE two_factor_secrets SET recovery_codes = $2, updated_at = now() WHERE user_id = $1`, id, raw)
	return wrap("update recovery codes", err)
}

func (r *pgxRepository) DeleteTwoFactor(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM two_factor_secrets WHERE user_id = $1`, id)
	return wrap("delete two_factor", err)
}

func (r *pgxRepository) ApplyPasswordChange(ctx context.Context, id uuid.UUID, passwordHash string, at time.Time, s *Session) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, passwordHash); err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, id, at); err != nil {
			return fmt.Errorf("revoke sessions: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, ip, created_at, expires_at)
			 VALUES ($1, $2, $3, $4, $5::inet, $6, $7)`,
			s.ID, s.UserID, s.RefreshTokenHash, s.UserAgent, s.IP, s.CreatedAt, s.ExpiresAt); err != nil {
			return fmt.Errorf("insert session: %w", err)
		}
		return nil
	})
}

func wrap(op string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", op, err)
	}
	return nil
}
