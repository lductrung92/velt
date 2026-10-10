package shared

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SpineRepo is the cross-cutting RBAC data-access contract used by the Base
// anti-escalation / self-protection helpers (queries spanning users + roles +
// permissions). Feature repos keep their own feature-scoped queries separately.
type SpineRepo interface {
	GetRole(ctx context.Context, id uuid.UUID) (*Role, error)
	GetRoleByCode(ctx context.Context, code string) (*Role, error)
	RolePermissionCodes(ctx context.Context, roleID uuid.UUID) ([]string, error)
	PermissionCodesByIDs(ctx context.Context, ids []uuid.UUID) ([]string, error)
	ActorEffectivePermissions(ctx context.Context, actorID uuid.UUID) (map[string]bool, error)
	ActiveSuperAdminIDs(ctx context.Context) ([]uuid.UUID, error)
	UserIsSuperAdmin(ctx context.Context, userID uuid.UUID) (bool, error)
}

type pgxSpine struct {
	pool *pgxpool.Pool
}

// NewSpineRepo builds the pgx-backed RBAC spine repository.
func NewSpineRepo(pool *pgxpool.Pool) SpineRepo { return &pgxSpine{pool: pool} }

func scanRole(row pgx.Row) (*Role, error) {
	var r Role
	err := row.Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.IsSystem, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan role: %w", err)
	}
	return &r, nil
}

func (r *pgxSpine) GetRole(ctx context.Context, id uuid.UUID) (*Role, error) {
	return scanRole(r.pool.QueryRow(ctx,
		`SELECT id, code, name, description, is_system, updated_at FROM roles WHERE id = $1`, id))
}

func (r *pgxSpine) GetRoleByCode(ctx context.Context, code string) (*Role, error) {
	return scanRole(r.pool.QueryRow(ctx,
		`SELECT id, code, name, description, is_system, updated_at FROM roles WHERE code = $1`, code))
}

func (r *pgxSpine) RolePermissionCodes(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	return r.queryStrings(ctx,
		`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
		  WHERE rp.role_id = $1 ORDER BY p.code`, roleID)
}

func (r *pgxSpine) PermissionCodesByIDs(ctx context.Context, ids []uuid.UUID) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	return r.queryStrings(ctx, `SELECT code FROM permissions WHERE id = ANY($1)`, ids)
}

func (r *pgxSpine) ActorEffectivePermissions(ctx context.Context, actorID uuid.UUID) (map[string]bool, error) {
	codes, err := r.queryStrings(ctx,
		`SELECT DISTINCT p.code
		   FROM user_roles ur
		   JOIN role_permissions rp ON rp.role_id = ur.role_id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE ur.user_id = $1`, actorID)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(codes))
	for _, c := range codes {
		set[c] = true
	}
	return set, nil
}

// ActiveSuperAdminIDs returns the ids of active users holding super_admin.
func (r *pgxSpine) ActiveSuperAdminIDs(ctx context.Context) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT u.id
		   FROM users u
		   JOIN user_roles ur ON ur.user_id = u.id
		   JOIN roles r ON r.id = ur.role_id
		  WHERE r.code = $1 AND u.status = 'active'`, RoleSuperAdmin)
	if err != nil {
		return nil, fmt.Errorf("active super admins: %w", err)
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan super admin id: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (r *pgxSpine) UserIsSuperAdmin(ctx context.Context, userID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		    WHERE ur.user_id = $1 AND r.code = $2)`, userID, RoleSuperAdmin).Scan(&exists)
	return exists, Wrap("user is super admin", err)
}

func (r *pgxSpine) queryStrings(ctx context.Context, sql string, args ...any) ([]string, error) {
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
