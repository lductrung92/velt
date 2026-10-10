package roles

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

func ctx() context.Context { return context.Background() }

func TestListRoles_RequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListRoles(ctx(), admintest.ActorWith())
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestGetRole_NotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetRole(ctx(), e.superActor(), uuid.New())
	admintest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestCreateRole_SubsetViolation(t *testing.T) {
	e := newTestSvc(t)
	pid := e.repo.ensurePerm("secret.do")
	actor := e.actorWith("roles.manage")
	_, err := e.svc.CreateRole(ctx(), actor, CreateRoleRequest{Code: "r", Name: "R", PermissionIDs: []uuid.UUID{pid}})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestCreateRole_OK(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreateRole(ctx(), e.superActor(), CreateRoleRequest{Code: "custom", Name: "Custom"})
	require.NoError(t, err)
	require.Equal(t, "custom", res.Code)
}

func TestUpdateRole_SystemLocked(t *testing.T) {
	e := newTestSvc(t)
	sys := e.repo.addRole("admin", "Admin", true)
	name := "Renamed"
	_, err := e.svc.UpdateRole(ctx(), e.superActor(), sys.ID, UpdateRoleRequest{Name: &name, UpdatedAt: sys.UpdatedAt})
	admintest.AssertAppErr(t, err, http.StatusConflict, "system_role_locked")
}

func TestUpdateRole_OptimisticConflict(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	name := "First"
	_, err := e.svc.UpdateRole(ctx(), e.superActor(), role.ID, UpdateRoleRequest{Name: &name, UpdatedAt: role.UpdatedAt})
	require.NoError(t, err)
	name2 := "Second"
	_, err = e.svc.UpdateRole(ctx(), e.superActor(), role.ID, UpdateRoleRequest{Name: &name2, UpdatedAt: e.clk})
	admintest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestReplacePermissions_SystemLocked(t *testing.T) {
	e := newTestSvc(t)
	sys := e.repo.addRole("admin", "Admin", true)
	_, err := e.svc.ReplaceRolePermissions(ctx(), e.superActor(), sys.ID, ReplaceRolePermissionsRequest{UpdatedAt: sys.UpdatedAt})
	admintest.AssertAppErr(t, err, http.StatusConflict, "system_role_locked")
}

func TestDeleteRole_SystemLocked(t *testing.T) {
	e := newTestSvc(t)
	sys := e.repo.addRole("editor", "Editor", true)
	err := e.svc.DeleteRole(ctx(), e.superActor(), sys.ID)
	admintest.AssertAppErr(t, err, http.StatusConflict, "system_role_locked")
}

func TestDeleteRole_InUse(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	e.repo.addUser("m@x.test", statusActive, role.ID)
	err := e.svc.DeleteRole(ctx(), e.superActor(), role.ID)
	admintest.AssertAppErr(t, err, http.StatusConflict, "role_in_use")
}

func TestDeleteRole_OK(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	require.NoError(t, e.svc.DeleteRole(ctx(), e.superActor(), role.ID))
}

func TestReplacePermissions_OK(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	pid := e.repo.ensurePerm("users.read")
	res, err := e.svc.ReplaceRolePermissions(ctx(), e.superActor(), role.ID,
		ReplaceRolePermissionsRequest{PermissionIDs: []uuid.UUID{pid}, UpdatedAt: role.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, 1, res.PermissionCount)
	require.Equal(t, []string{"users.read"}, res.Permissions)
}

func TestReplacePermissions_SubsetViolation(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	secret := e.repo.ensurePerm("secret.do") // not in the actor's effective set
	actor := e.actorWith("roles.manage")
	_, err := e.svc.ReplaceRolePermissions(ctx(), actor, role.ID,
		ReplaceRolePermissionsRequest{PermissionIDs: []uuid.UUID{secret}, UpdatedAt: role.UpdatedAt})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestReplacePermissions_OptimisticConflict(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	_, err := e.svc.ReplaceRolePermissions(ctx(), e.superActor(), role.ID,
		ReplaceRolePermissionsRequest{UpdatedAt: role.UpdatedAt})
	require.NoError(t, err)
	// Second write with the now-stale timestamp loses the optimistic lock.
	_, err = e.svc.ReplaceRolePermissions(ctx(), e.superActor(), role.ID,
		ReplaceRolePermissionsRequest{UpdatedAt: e.clk})
	admintest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestListRoleMembers_OK(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	e.repo.addUser("a@x.test", statusActive, role.ID)
	e.repo.addUser("b@x.test", statusActive, role.ID)
	page, err := e.svc.ListRoleMembers(ctx(), e.superActor(), role.ID, 1, 20)
	require.NoError(t, err)
	require.Equal(t, 2, page.Total)
	require.Len(t, page.Items, 2)
}

func TestListRoleMembers_NotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListRoleMembers(ctx(), e.superActor(), uuid.New(), 1, 20)
	admintest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestListRoleMembers_RequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("custom", "Custom", false)
	_, err := e.svc.ListRoleMembers(ctx(), e.actorWith(), role.ID, 1, 20)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestListPermissions_Grouped(t *testing.T) {
	e := newTestSvc(t)
	e.repo.ensurePerm("users.read")
	e.repo.ensurePerm("users.create")
	e.repo.ensurePerm("roles.read")
	groups, err := e.svc.ListPermissions(ctx(), e.superActor())
	require.NoError(t, err)
	byResource := map[string]int{}
	for _, g := range groups {
		byResource[g.Resource] = len(g.Permissions)
	}
	require.Equal(t, 2, byResource["users"])
	require.Equal(t, 1, byResource["roles"])
}
