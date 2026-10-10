package roles

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/admin/shared"
)

// Repository is the data-access contract for role management. Cross-cutting RBAC
// reads (GetRole/GetRoleByCode/RolePermissionCodes) come from the shared spine.
type Repository interface {
	ListRoles(ctx context.Context) ([]RoleResponse, error)
	ListRoleMembers(ctx context.Context, roleID uuid.UUID, page, pageSize int) ([]RoleMember, int, error)
	CreateRole(ctx context.Context, code, name string, desc *string, permIDs []uuid.UUID) (*shared.Role, error)
	UpdateRoleMeta(ctx context.Context, id uuid.UUID, name string, desc *string, expected time.Time) (time.Time, error)
	ReplaceRolePermissions(ctx context.Context, id uuid.UUID, permIDs []uuid.UUID, expected time.Time) (time.Time, error)
	DeleteRole(ctx context.Context, id uuid.UUID) error
	CountRoleMembers(ctx context.Context, roleID uuid.UUID) (int, error)
	ListPermissions(ctx context.Context) ([]PermissionItem, error)
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed role repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func (r *pgxRepository) ListRoles(ctx context.Context) ([]RoleResponse, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT r.id, r.code, r.name, r.description, r.is_system, r.updated_at,
		        (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS member_count,
		        (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
		   FROM roles r ORDER BY r.is_system DESC, r.code`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()
	var out []RoleResponse
	for rows.Next() {
		var rr RoleResponse
		if err := rows.Scan(&rr.ID, &rr.Code, &rr.Name, &rr.Description, &rr.IsSystem, &rr.UpdatedAt,
			&rr.MemberCount, &rr.PermissionCount); err != nil {
			return nil, fmt.Errorf("scan role row: %w", err)
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

func (r *pgxRepository) ListRoleMembers(ctx context.Context, roleID uuid.UUID, page, pageSize int) ([]RoleMember, int, error) {
	page, pageSize = shared.NormalizePage(page, pageSize)
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM user_roles WHERE role_id = $1`, roleID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count members: %w", err)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT u.id, u.full_name, u.email, ur.assigned_at
		   FROM user_roles ur JOIN users u ON u.id = ur.user_id
		  WHERE ur.role_id = $1 ORDER BY ur.assigned_at DESC LIMIT $2 OFFSET $3`,
		roleID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()
	var out []RoleMember
	for rows.Next() {
		var m RoleMember
		if err := rows.Scan(&m.UserID, &m.FullName, &m.Email, &m.AssignedAt); err != nil {
			return nil, 0, fmt.Errorf("scan member: %w", err)
		}
		out = append(out, m)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) CreateRole(ctx context.Context, code, name string, desc *string, permIDs []uuid.UUID) (*shared.Role, error) {
	var role shared.Role
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`INSERT INTO roles (code, name, description, is_system) VALUES ($1, $2, $3, false)
			 RETURNING id, code, name, description, is_system, updated_at`, code, name, desc).
			Scan(&role.ID, &role.Code, &role.Name, &role.Description, &role.IsSystem, &role.UpdatedAt)
		if err != nil {
			if shared.IsUniqueViolation(err) {
				return shared.ErrConflict
			}
			return fmt.Errorf("insert role: %w", err)
		}
		for _, pid := range permIDs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
				role.ID, pid); err != nil {
				return fmt.Errorf("map permission: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// UpdateRoleMeta optimistic-locks on expected updated_at. ErrConflict on mismatch.
func (r *pgxRepository) UpdateRoleMeta(ctx context.Context, id uuid.UUID, name string, desc *string, expected time.Time) (time.Time, error) {
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`UPDATE roles SET name = $2, description = $3, updated_at = now()
		  WHERE id = $1 AND updated_at = $4
		  RETURNING updated_at`, id, name, desc, expected).Scan(&updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, shared.ErrConflict
	}
	if err != nil {
		return time.Time{}, fmt.Errorf("update role meta: %w", err)
	}
	return updatedAt, nil
}

// ReplaceRolePermissions optimistic-locks then overwrites the permission set.
func (r *pgxRepository) ReplaceRolePermissions(ctx context.Context, id uuid.UUID, permIDs []uuid.UUID, expected time.Time) (time.Time, error) {
	var updatedAt time.Time
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		e := tx.QueryRow(ctx,
			`UPDATE roles SET updated_at = now() WHERE id = $1 AND updated_at = $2 RETURNING updated_at`,
			id, expected).Scan(&updatedAt)
		if errors.Is(e, pgx.ErrNoRows) {
			return shared.ErrConflict
		}
		if e != nil {
			return fmt.Errorf("lock role: %w", e)
		}
		if _, e := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, id); e != nil {
			return fmt.Errorf("clear permissions: %w", e)
		}
		for _, pid := range permIDs {
			if _, e := tx.Exec(ctx,
				`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
				id, pid); e != nil {
				return fmt.Errorf("map permission: %w", e)
			}
		}
		return nil
	})
	if err != nil {
		return time.Time{}, err
	}
	return updatedAt, nil
}

func (r *pgxRepository) DeleteRole(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id)
	return shared.Wrap("delete role", err)
}

func (r *pgxRepository) CountRoleMembers(ctx context.Context, roleID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM user_roles WHERE role_id = $1`, roleID).Scan(&n)
	return n, shared.Wrap("count role members", err)
}

func (r *pgxRepository) ListPermissions(ctx context.Context) ([]PermissionItem, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, code, description FROM permissions ORDER BY code`)
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()
	var out []PermissionItem
	for rows.Next() {
		var p PermissionItem
		if err := rows.Scan(&p.ID, &p.Code, &p.Description); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
