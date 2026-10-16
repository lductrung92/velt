package users

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/shared/admintest"
	"github.com/velt/backend/internal/platform/crypto"
)

func itHash(t *testing.T) string {
	t.Helper()
	h, err := crypto.HashPassword("integration-password")
	require.NoError(t, err)
	return h
}

func usersDB(t *testing.T) (Repository, shared.SpineRepo) {
	t.Helper()
	pool := admintest.RequireDB(t)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE email LIKE 'adminit-%@x.test'`)
	})
	return NewRepository(pool), shared.NewSpineRepo(pool)
}

func TestIT_EffectivePermissionsAndSuperAdmin(t *testing.T) {
	repo, spine := usersDB(t)
	ctx := context.Background()
	adminRole, err := spine.GetRoleByCode(ctx, "admin")
	require.NoError(t, err)
	superRole, err := spine.GetRoleByCode(ctx, shared.RoleSuperAdmin)
	require.NoError(t, err)

	admin, err := repo.CreateUser(ctx, "adminit-admin-"+uuid.NewString()+"@x.test", "Admin", itHash(t), []uuid.UUID{adminRole.ID}, uuid.Nil)
	require.NoError(t, err)
	super, err := repo.CreateUser(ctx, "adminit-super-"+uuid.NewString()+"@x.test", "Super", itHash(t), []uuid.UUID{superRole.ID}, uuid.Nil)
	require.NoError(t, err)

	adminPerms, err := spine.ActorEffectivePermissions(ctx, admin.ID)
	require.NoError(t, err)
	require.True(t, adminPerms["users.read"])
	require.True(t, adminPerms["roles.manage"])
	require.False(t, adminPerms[shared.PermWildcard])

	superPerms, _ := spine.ActorEffectivePermissions(ctx, super.ID)
	require.True(t, superPerms[shared.PermWildcard])

	isSuper, _ := spine.UserIsSuperAdmin(ctx, super.ID)
	require.True(t, isSuper)
	isSuper2, _ := spine.UserIsSuperAdmin(ctx, admin.ID)
	require.False(t, isSuper2)

	ids, err := spine.ActiveSuperAdminIDs(ctx)
	require.NoError(t, err)
	require.Contains(t, ids, super.ID)
}

func TestIT_ListUsersFilterAndPaginate(t *testing.T) {
	repo, _ := usersDB(t)
	ctx := context.Background()
	tag := uuid.NewString()[:8]
	for i := 0; i < 3; i++ {
		_, err := repo.CreateUser(ctx, "adminit-"+tag+"-"+uuid.NewString()+"@x.test", "U", itHash(t), nil, uuid.Nil)
		require.NoError(t, err)
	}
	usersRows, total, err := repo.ListUsers(ctx, ListUsersFilter{Query: "adminit-" + tag, PageSize: 2})
	require.NoError(t, err)
	require.Equal(t, 3, total)
	require.Len(t, usersRows, 2)
}

func TestIT_CreateUserAssignRoles(t *testing.T) {
	repo, spine := usersDB(t)
	ctx := context.Background()
	editor, err := spine.GetRoleByCode(ctx, "editor")
	require.NoError(t, err)
	u, err := repo.CreateUser(ctx, "adminit-u-"+uuid.NewString()+"@x.test", "U", itHash(t), []uuid.UUID{editor.ID}, uuid.Nil)
	require.NoError(t, err)

	roles, err := repo.RolesForUser(ctx, u.ID)
	require.NoError(t, err)
	require.Len(t, roles, 1)
	require.Equal(t, "editor", roles[0].Code)
}

func TestIT_ListUsersFilterByRole(t *testing.T) {
	repo, spine := usersDB(t)
	ctx := context.Background()
	editor, err := spine.GetRoleByCode(ctx, "editor")
	require.NoError(t, err)
	tag := uuid.NewString()[:8]
	withRole, err := repo.CreateUser(ctx, "adminit-"+tag+"-r-"+uuid.NewString()+"@x.test", "R", itHash(t), []uuid.UUID{editor.ID}, uuid.Nil)
	require.NoError(t, err)
	_, err = repo.CreateUser(ctx, "adminit-"+tag+"-n-"+uuid.NewString()+"@x.test", "N", itHash(t), nil, uuid.Nil)
	require.NoError(t, err)

	rows, total, err := repo.ListUsers(ctx, ListUsersFilter{Query: "adminit-" + tag, Role: "editor"})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, rows, 1)
	require.Equal(t, withRole.ID, rows[0].ID)
}

func TestIT_SetPassword(t *testing.T) {
	repo, _ := usersDB(t)
	ctx := context.Background()
	u, err := repo.CreateUser(ctx, "adminit-pw-"+uuid.NewString()+"@x.test", "PW", itHash(t), nil, uuid.Nil)
	require.NoError(t, err)
	next, err := crypto.HashPassword("integration-password-2")
	require.NoError(t, err)
	// Exercises the real UPDATE across users / password_reset_tokens /
	// auth_sessions — the three tables the one transaction touches.
	require.NoError(t, repo.SetPassword(ctx, u.ID, next, time.Now()))
}
