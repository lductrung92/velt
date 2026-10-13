package sessions

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

func ctx() context.Context { return context.Background() }

func TestSessions_ListRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListSessions(ctx(), admintest.ActorWith(), ListFilter{})
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestSessions_ListMarksLastSuperAdmin(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("s@x.test")
	e.repo.addSession(u.id)
	e.spine.SuperIDs = []uuid.UUID{u.id} // exactly one active super_admin → flagged
	page, err := e.svc.ListSessions(ctx(), admintest.SuperActor(), ListFilter{})
	require.NoError(t, err)
	require.Len(t, page.Items, 1)
	require.True(t, page.Items[0].IsLastSuperAdmin)
}

func TestSessions_RevokeNotFound(t *testing.T) {
	e := newTestSvc(t)
	err := e.svc.RevokeSession(ctx(), admintest.SuperActor(), uuid.New())
	admintest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestSessions_RevokeOK(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("t@x.test")
	sid := e.repo.addSession(u.id)
	require.NoError(t, e.svc.RevokeSession(ctx(), admintest.SuperActor(), sid))
	require.True(t, e.repo.sessions[sid].revoked)
}

func TestSessions_RevokeUserSessionsNotFound(t *testing.T) {
	e := newTestSvc(t)
	err := e.svc.RevokeUserSessions(ctx(), admintest.SuperActor(), uuid.New())
	admintest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestSessions_RevokeUserSessionsOK(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("t@x.test")
	sid := e.repo.addSession(u.id)
	require.NoError(t, e.svc.RevokeUserSessions(ctx(), admintest.SuperActor(), u.id))
	require.True(t, e.repo.sessions[sid].revoked)
}

// Both revoke mutations are gated by sessions.kill — an actor without it is
// rejected before any lookup (so a real session id still 403s, not 404s).
func TestSessions_RevokeRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("t@x.test")
	sid := e.repo.addSession(u.id)
	noPerm := admintest.ActorWith()
	admintest.AssertAppErr(t, e.svc.RevokeSession(ctx(), noPerm, sid), http.StatusForbidden, "access_denied")
	admintest.AssertAppErr(t, e.svc.RevokeUserSessions(ctx(), noPerm, u.id), http.StatusForbidden, "access_denied")
	require.False(t, e.repo.sessions[sid].revoked, "no revocation on a denied call")
}
