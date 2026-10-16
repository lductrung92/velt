package users

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Repository is the data-access contract for user management. Cross-cutting RBAC
// reads come from the shared spine (via Base), not here.
type Repository interface {
	GetUser(ctx context.Context, id uuid.UUID) (*User, error)
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	ListUsers(ctx context.Context, f ListUsersFilter) ([]User, int, error)
	CreateUser(ctx context.Context, email, fullName, passwordHash string, roleIDs []uuid.UUID, assignedBy uuid.UUID) (*User, error)
	// SetPassword replaces the password hash, revokes every live session and
	// burns any outstanding reset token in ONE transaction, so a regenerated
	// temporary password is the only way back into the account.
	SetPassword(ctx context.Context, id uuid.UUID, passwordHash string, at time.Time) error
	HardDeleteUser(ctx context.Context, id uuid.UUID) error
	AssignRole(ctx context.Context, userID, roleID, assignedBy uuid.UUID) error
	RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error
	// UpdateUserAtomic applies profile/status, optional session-revoke, and
	// optional single-tx role replacement together in ONE transaction, so an
	// edit can't be left half-applied (status changed but role/sessions not).
	// roleIDs nil = leave roles untouched; revokeSessions revokes all sessions.
	UpdateUserAtomic(ctx context.Context, id uuid.UUID, fullName, status *string, revokeSessions bool, roleIDs *[]uuid.UUID, assignedBy uuid.UUID, at time.Time) error
	RolesForUser(ctx context.Context, userID uuid.UUID) ([]shared.RoleSummary, error)
	RolesForUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]shared.RoleSummary, error)
	TwoFactorEnabledForUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]bool, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed user repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const userColumns = `id, email, full_name, avatar_path, status, created_at, last_login_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.FullName, &u.AvatarPath, &u.Status, &u.CreatedAt, &u.LastLoginAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &u, nil
}

func (r *pgxRepository) GetUser(ctx context.Context, id uuid.UUID) (*User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

func (r *pgxRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
}

// sortClause maps a whitelisted sort key to an ORDER BY clause (no injection).
// status / last_login_at carry an id tiebreaker for deterministic pagination;
// nullable last_login_at sorts NULLS LAST.
func sortClause(sort string) string {
	switch sort {
	case "email":
		return "email ASC"
	case "-email":
		return "email DESC"
	case "full_name":
		return "full_name ASC"
	case "-full_name":
		return "full_name DESC"
	case "status":
		return "status ASC, id ASC"
	case "-status":
		return "status DESC, id ASC"
	case "last_login_at":
		return "last_login_at ASC NULLS LAST, id ASC"
	case "-last_login_at":
		return "last_login_at DESC NULLS LAST, id ASC"
	case "created_at":
		return "created_at ASC"
	default:
		return "created_at DESC"
	}
}

func (r *pgxRepository) ListUsers(ctx context.Context, f ListUsersFilter) ([]User, int, error) {
	page, pageSize := shared.NormalizePage(f.Page, f.PageSize)
	conds := []string{"TRUE"}
	args := []any{}
	if f.Status != "" {
		args = append(args, f.Status)
		conds = append(conds, fmt.Sprintf("status = $%d", len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		conds = append(conds, fmt.Sprintf("(email ILIKE $%d OR full_name ILIKE $%d)", len(args), len(args)))
	}
	if f.Role != "" {
		args = append(args, f.Role)
		conds = append(conds, fmt.Sprintf(
			`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
			          WHERE ur.user_id = users.id AND r.code = $%d)`, len(args)))
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	args = append(args, pageSize, (page-1)*pageSize)
	q := fmt.Sprintf(`SELECT %s FROM users WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`,
		userColumns, where, sortClause(f.Sort), len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.AvatarPath, &u.Status, &u.CreatedAt, &u.LastLoginAt); err != nil {
			return nil, 0, fmt.Errorf("scan user row: %w", err)
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) CreateUser(ctx context.Context, email, fullName, passwordHash string, roleIDs []uuid.UUID, assignedBy uuid.UUID) (*User, error) {
	var u User
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`INSERT INTO users (email, password_hash, full_name, status)
			 VALUES ($1, $2, $3, 'active')
			 RETURNING `+userColumns, email, passwordHash, fullName).
			Scan(&u.ID, &u.Email, &u.FullName, &u.AvatarPath, &u.Status, &u.CreatedAt, &u.LastLoginAt)
		if err != nil {
			if shared.IsUniqueViolation(err) {
				return shared.ErrConflict
			}
			return fmt.Errorf("insert user: %w", err)
		}
		ab := shared.NullableUUID(assignedBy)
		for _, rid := range roleIDs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)
				 ON CONFLICT DO NOTHING`, u.ID, rid, ab); err != nil {
				return fmt.Errorf("assign role: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *pgxRepository) SetPassword(ctx context.Context, id uuid.UUID, passwordHash string, at time.Time) error {
	return shared.Wrap("set password", pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, passwordHash); err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		// A reset link mailed before this one is no longer the admin's intent:
		// leaving it live would let an old inbox overwrite the password that was
		// just handed over in person.
		if _, err := tx.Exec(ctx,
			`UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL`, id, at); err != nil {
			return fmt.Errorf("burn reset tokens: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, id, at); err != nil {
			return fmt.Errorf("revoke sessions: %w", err)
		}
		return nil
	}))
}

func (r *pgxRepository) HardDeleteUser(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return shared.Wrap("hard delete user", err)
}

func (r *pgxRepository) AssignRole(ctx context.Context, userID, roleID, assignedBy uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)
		 ON CONFLICT DO NOTHING`, userID, roleID, shared.NullableUUID(assignedBy))
	return shared.Wrap("assign role", err)
}

func (r *pgxRepository) RemoveRole(ctx context.Context, userID, roleID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, userID, roleID)
	return shared.Wrap("remove role", err)
}

// UpdateUserAtomic applies the profile/status update, optional session revocation
// (AD-3), and optional full role replacement in ONE transaction — so a console
// edit can never be left half-applied (e.g. status changed but role unchanged, or
// disabled but sessions still live) on a mid-sequence failure. roleIDs == nil
// leaves the user's roles untouched.
// ErrLastSuperAdmin is returned by UpdateUserAtomic when a guarded change (role
// swap or disable) would leave the system with zero active super admins. It is
// the race-safe backstop for the service's fast-path AssertNotLastSuperAdmin
// check (two concurrent demotions could both pass that check-then-act).
var ErrLastSuperAdmin = errors.New("last super admin")

// superAdminGuardLock is the fixed key for the tx advisory lock that serializes
// super-admin-membership-changing operations.
const superAdminGuardLock int64 = 0x5A175EED

func countActiveSuperAdmins(ctx context.Context, tx pgx.Tx) (int, error) {
	var n int
	err := tx.QueryRow(ctx,
		`SELECT count(*) FROM user_roles ur
		   JOIN roles r ON r.id = ur.role_id
		   JOIN users u ON u.id = ur.user_id
		  WHERE r.code = $1 AND u.status = 'active'`, shared.RoleSuperAdmin).Scan(&n)
	return n, err
}

func (r *pgxRepository) UpdateUserAtomic(ctx context.Context, id uuid.UUID, fullName, status *string, revokeSessions bool, roleIDs *[]uuid.UUID, assignedBy uuid.UUID, at time.Time) error {
	// This op can drop an active super admin only when it changes roles or disables
	// the user; then serialize on a tx advisory lock and enforce that ≥1 active
	// super admin remains — a race-safe backstop for the service's fast-path check.
	guard := roleIDs != nil || (status != nil && *status == "disabled")
	return shared.Wrap("update user", pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var preSupers int
		if guard {
			if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, superAdminGuardLock); err != nil {
				return err
			}
			var err error
			if preSupers, err = countActiveSuperAdmins(ctx, tx); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx,
			`UPDATE users SET full_name = COALESCE($2, full_name), status = COALESCE($3, status), updated_at = now()
			  WHERE id = $1`, id, fullName, status); err != nil {
			return err
		}
		if revokeSessions {
			if _, err := tx.Exec(ctx,
				`UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, id, at); err != nil {
				return err
			}
		}
		if roleIDs != nil {
			if _, err := tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, id); err != nil {
				return fmt.Errorf("clear roles: %w", err)
			}
			ab := shared.NullableUUID(assignedBy)
			for _, rid := range *roleIDs {
				if _, err := tx.Exec(ctx,
					`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)
					 ON CONFLICT DO NOTHING`, id, rid, ab); err != nil {
					return fmt.Errorf("set role: %w", err)
				}
			}
		}
		if guard {
			postSupers, err := countActiveSuperAdmins(ctx, tx)
			if err != nil {
				return err
			}
			if preSupers > 0 && postSupers == 0 {
				return ErrLastSuperAdmin
			}
		}
		return nil
	}))
}

func (r *pgxRepository) RolesForUser(ctx context.Context, userID uuid.UUID) ([]shared.RoleSummary, error) {
	m, err := r.RolesForUsers(ctx, []uuid.UUID{userID})
	if err != nil {
		return nil, err
	}
	return m[userID], nil
}

func (r *pgxRepository) RolesForUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]shared.RoleSummary, error) {
	out := make(map[uuid.UUID][]shared.RoleSummary)
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT ur.user_id, r.id, r.code, r.name
		   FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		  WHERE ur.user_id = ANY($1) ORDER BY r.code`, userIDs)
	if err != nil {
		return nil, fmt.Errorf("roles for users: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var uid uuid.UUID
		var rs shared.RoleSummary
		if err := rows.Scan(&uid, &rs.ID, &rs.Code, &rs.Name); err != nil {
			return nil, fmt.Errorf("scan role summary: %w", err)
		}
		out[uid] = append(out[uid], rs)
	}
	return out, rows.Err()
}

func (r *pgxRepository) TwoFactorEnabledForUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	out := make(map[uuid.UUID]bool)
	if len(userIDs) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT user_id FROM two_factor_secrets WHERE user_id = ANY($1) AND enabled_at IS NOT NULL`, userIDs)
	if err != nil {
		return nil, fmt.Errorf("2fa for users: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var uid uuid.UUID
		if err := rows.Scan(&uid); err != nil {
			return nil, fmt.Errorf("scan 2fa: %w", err)
		}
		out[uid] = true
	}
	return out, rows.Err()
}
