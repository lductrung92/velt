package roles

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

func TestIT_RoleOptimisticLockAndPermissions(t *testing.T) {
	pool := admintest.RequireDB(t)
	repo := NewRepository(pool)
	spine := shared.NewSpineRepo(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM roles WHERE code LIKE 'adminit-%'`) // role_permissions cascade
	})

	role, err := repo.CreateRole(ctx, "adminit-"+uuid.NewString()[:8], "IT Role", nil, nil)
	require.NoError(t, err)

	// Correct updated_at → success (and the timestamp advances).
	newUpdated, err := repo.UpdateRoleMeta(ctx, role.ID, "Renamed", nil, role.UpdatedAt)
	require.NoError(t, err)
	require.True(t, newUpdated.After(role.UpdatedAt))

	// Stale updated_at → conflict.
	_, err = repo.UpdateRoleMeta(ctx, role.ID, "Again", nil, role.UpdatedAt)
	require.ErrorIs(t, err, shared.ErrConflict)

	// ReplaceRolePermissions: lock on current updated_at, then verify codes round-trip.
	cur, err := spine.GetRole(ctx, role.ID)
	require.NoError(t, err)
	var usersReadID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM permissions WHERE code = $1`, "users.read").Scan(&usersReadID))
	_, err = repo.ReplaceRolePermissions(ctx, role.ID, []uuid.UUID{usersReadID}, cur.UpdatedAt)
	require.NoError(t, err)
	codes, err := spine.RolePermissionCodes(ctx, role.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"users.read"}, codes)
}
