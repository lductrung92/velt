package users

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared"
	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

func ctx() context.Context { return context.Background() }

func TestListUsers_RequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListUsers(ctx(), e.actorWith(), ListUsersFilter{})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestListUsers_RolesNeverNil(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("noroles@x.test", statusActive)
	res, err := e.svc.ListUsers(ctx(), e.superActor(), ListUsersFilter{})
	require.NoError(t, err)
	var found bool
	for _, item := range res.Items {
		if item.ID == u.ID {
			found = true
			require.NotNil(t, item.Roles)
			require.Empty(t, item.Roles)
		}
	}
	require.True(t, found, "no-role user must appear in the list")
}

func TestGetUser_NotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetUser(ctx(), e.superActor(), uuid.New())
	admintest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestCreateUser_DefaultEditorAndMail(t *testing.T) {
	e := newTestSvc(t)
	e.repo.addRole(roleEditor, "Editor", true)
	res, err := e.svc.CreateUser(ctx(), e.superActor(), CreateUserRequest{Email: "new@x.test", FullName: "New"})
	require.NoError(t, err)
	require.Equal(t, "new@x.test", res.Email)
	require.Len(t, res.Roles, 1)
	require.Equal(t, roleEditor, res.Roles[0].Code)
	require.Len(t, e.reset.sent, 1)
}

func TestCreateUser_AntiEscalation(t *testing.T) {
	e := newTestSvc(t)
	powerful := e.repo.addRole("powerful", "Powerful", false, "users.delete")
	actor := e.actorWith("users.create")
	_, err := e.svc.CreateUser(ctx(), actor, CreateUserRequest{Email: "x@x.test", FullName: "X", RoleIDs: []uuid.UUID{powerful.ID}})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestCreateUser_EmailConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.addRole(roleEditor, "Editor", true)
	e.repo.addUser("dupe@x.test", statusActive)
	_, err := e.svc.CreateUser(ctx(), e.superActor(), CreateUserRequest{Email: "dupe@x.test", FullName: "D"})
	admintest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestCreateUser_NonSuperEditorOK(t *testing.T) {
	e := newTestSvc(t)
	editor := e.repo.addRole(roleEditor, "Editor", true)
	actor := e.actorWith("users.create")
	res, err := e.svc.CreateUser(ctx(), actor, CreateUserRequest{Email: "ed@x.test", FullName: "Ed", RoleIDs: []uuid.UUID{editor.ID}})
	require.NoError(t, err)
	require.Len(t, res.Roles, 1)
	require.Equal(t, roleEditor, res.Roles[0].Code)
}

func TestCreateUser_NonSuperRejectsNonEditor(t *testing.T) {
	e := newTestSvc(t)
	support := e.repo.addRole("support", "Support", false, "reports.view")
	actor := e.actorWith("users.create", "reports.view")
	_, err := e.svc.CreateUser(ctx(), actor, CreateUserRequest{Email: "s@x.test", FullName: "S", RoleIDs: []uuid.UUID{support.ID}})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestUpdateUser_SelfDisable(t *testing.T) {
	e := newTestSvc(t)
	actor := e.actorWith("users.update")
	disabled := statusDisabled
	_, err := e.svc.UpdateUser(ctx(), actor, actor.UserID, UpdateUserRequest{Status: &disabled})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "cannot_modify_self")
}

func TestUpdateUser_LastSuperAdmin(t *testing.T) {
	e := newTestSvc(t)
	s1 := e.superActor()
	admin := e.actorWith("users.update")
	disabled := statusDisabled
	_, err := e.svc.UpdateUser(ctx(), admin, s1.UserID, UpdateUserRequest{Status: &disabled})
	admintest.AssertAppErr(t, err, http.StatusConflict, "last_super_admin")
}

func TestUpdateUser_DisableRevokesSessions(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	sid := e.repo.addSession(target.ID)
	disabled := statusDisabled
	_, err := e.svc.UpdateUser(ctx(), e.superActor(), target.ID, UpdateUserRequest{Status: &disabled})
	require.NoError(t, err)
	require.True(t, e.repo.sessions[sid].revoked)
}

func TestUpdateUser_ReactivateSendsMail(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusDisabled)
	active := statusActive
	_, err := e.svc.UpdateUser(ctx(), e.superActor(), target.ID, UpdateUserRequest{Status: &active})
	require.NoError(t, err)
	require.Len(t, e.reset.sent, 1)
}

func TestUpdateUser_NoMailWhenStaysActive(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	active := statusActive
	_, err := e.svc.UpdateUser(ctx(), e.superActor(), target.ID, UpdateUserRequest{Status: &active})
	require.NoError(t, err)
	require.Empty(t, e.reset.sent)
}

func TestUpdateUser_RoleByNonSuperDenied(t *testing.T) {
	e := newTestSvc(t)
	editor := e.repo.addRole(roleEditor, "Editor", true)
	target := e.repo.addUser("t@x.test", statusActive)
	actor := e.actorWith("users.update")
	_, err := e.svc.UpdateUser(ctx(), actor, target.ID, UpdateUserRequest{RoleID: &editor.ID})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestUpdateUser_RoleBySuperReplaces(t *testing.T) {
	e := newTestSvc(t)
	old := e.repo.addRole("support", "Support", false)
	editor := e.repo.addRole(roleEditor, "Editor", true)
	target := e.repo.addUser("t@x.test", statusActive, old.ID)
	_, err := e.svc.UpdateUser(ctx(), e.superActor(), target.ID, UpdateUserRequest{RoleID: &editor.ID})
	require.NoError(t, err)
	require.True(t, e.repo.userRoles[target.ID][editor.ID])
	require.False(t, e.repo.userRoles[target.ID][old.ID])
}

func TestUpdateUser_RoleDemotesLastSuperAdmin(t *testing.T) {
	e := newTestSvc(t)
	editor := e.repo.addRole(roleEditor, "Editor", true)
	s1 := e.superActor()
	_, err := e.svc.UpdateUser(ctx(), s1, s1.UserID, UpdateUserRequest{RoleID: &editor.ID})
	admintest.AssertAppErr(t, err, http.StatusConflict, "last_super_admin")
}

func TestDeleteUser_SoftDisablesAndRevokesSessions(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	sid := e.repo.addSession(target.ID)
	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, false))
	require.Equal(t, statusDisabled, e.repo.users[target.ID].Status)
	require.True(t, e.repo.sessions[sid].revoked)
}

func TestDeleteUser_Self(t *testing.T) {
	e := newTestSvc(t)
	actor := e.actorWith("users.delete")
	err := e.svc.DeleteUser(ctx(), actor, actor.UserID, false)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "cannot_modify_self")
}

func TestDeleteUser_HardByNonSuper(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	actor := e.actorWith("users.delete")
	err := e.svc.DeleteUser(ctx(), actor, target.ID, true)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestDeleteUser_SoftDefault(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, false))
	require.Equal(t, statusDisabled, e.repo.users[target.ID].Status)
}

func TestDeleteUser_HardBySuper(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, true))
	_, ok := e.repo.users[target.ID]
	require.False(t, ok)
}

func TestAssignRole_SuperByNonSuper(t *testing.T) {
	e := newTestSvc(t)
	saID := e.repo.addRole(shared.RoleSuperAdmin, "Super", true, "*").ID
	target := e.repo.addUser("t@x.test", statusActive)
	actor := e.actorWith("users.assign_role")
	err := e.svc.AssignRole(ctx(), actor, target.ID, saID)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestAssignRole_SubsetViolation(t *testing.T) {
	e := newTestSvc(t)
	role := e.repo.addRole("secretops", "SecretOps", false, "secret.do")
	target := e.repo.addUser("t@x.test", statusActive)
	actor := e.actorWith("users.assign_role")
	err := e.svc.AssignRole(ctx(), actor, target.ID, role.ID)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestAssignRole_OK(t *testing.T) {
	e := newTestSvc(t)
	editor := e.repo.addRole(roleEditor, "Editor", true)
	target := e.repo.addUser("t@x.test", statusActive)
	require.NoError(t, e.svc.AssignRole(ctx(), e.superActor(), target.ID, editor.ID))
	require.True(t, e.repo.userRoles[target.ID][editor.ID])
}

func TestRemoveRole_SuperByNonSuper(t *testing.T) {
	e := newTestSvc(t)
	saID := e.repo.addRole(shared.RoleSuperAdmin, "Super", true, "*").ID
	target := e.repo.addUser("t@x.test", statusActive, saID)
	actor := e.actorWith("users.assign_role")
	err := e.svc.RemoveRole(ctx(), actor, target.ID, saID)
	admintest.AssertAppErr(t, err, http.StatusForbidden, "privilege_escalation_denied")
}

func TestRemoveRole_LastSuperAdmin(t *testing.T) {
	e := newTestSvc(t)
	s1 := e.superActor()
	saID := e.repo.byCode[shared.RoleSuperAdmin]
	err := e.svc.RemoveRole(ctx(), s1, s1.UserID, saID)
	admintest.AssertAppErr(t, err, http.StatusConflict, "last_super_admin")
}

func TestTriggerReset_DisabledTarget(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusDisabled)
	err := e.svc.TriggerResetPassword(ctx(), e.superActor(), target.ID)
	admintest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestTriggerReset_OK(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	require.NoError(t, e.svc.TriggerResetPassword(ctx(), e.superActor(), target.ID))
	require.Contains(t, e.reset.sent, target.ID)
}

// Every mutation must reject an actor lacking its permission. A wrong perm
// constant or a missing Require on a method would surface here.
func TestUsers_MutationsRequirePermission(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("t@x.test", statusActive)
	noPerm := e.actorWith()
	rid := uuid.New()
	cases := map[string]func() error{
		"GetUser":     func() error { _, err := e.svc.GetUser(ctx(), noPerm, target.ID); return err },
		"CreateUser":  func() error { _, err := e.svc.CreateUser(ctx(), noPerm, CreateUserRequest{}); return err },
		"UpdateUser":  func() error { _, err := e.svc.UpdateUser(ctx(), noPerm, target.ID, UpdateUserRequest{}); return err },
		"DeleteUser":  func() error { return e.svc.DeleteUser(ctx(), noPerm, target.ID, false) },
		"AssignRole":  func() error { return e.svc.AssignRole(ctx(), noPerm, target.ID, rid) },
		"RemoveRole":  func() error { return e.svc.RemoveRole(ctx(), noPerm, target.ID, rid) },
		"ResetPasswd": func() error { return e.svc.TriggerResetPassword(ctx(), noPerm, target.ID) },
	}
	for name, call := range cases {
		t.Run(name, func(t *testing.T) {
			admintest.AssertAppErr(t, call(), http.StatusForbidden, "access_denied")
		})
	}
}
