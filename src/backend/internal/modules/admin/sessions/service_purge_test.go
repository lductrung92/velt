package sessions

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared/admintest"
)

// A three-day window keeps the session from two days ago and deletes the one
// from four. This is the whole contract of "3 ngày trước" in the console's menu.
func TestSessions_PurgeKeepsTheWindowAndDeletesWhatIsOlder(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("u@x.test")
	young := e.repo.addSessionAged(u.id, 2)
	e.repo.addSessionAged(u.id, 4)

	res, err := e.svc.PurgeSessions(ctx(), admintest.ActorWith(permKill), "3d")
	require.NoError(t, err)
	require.EqualValues(t, 1, res.Deleted)
	require.Len(t, e.repo.sessions, 1)
	require.Contains(t, e.repo.sessions, young)
	require.True(t, e.repo.purgedBefore.Equal(e.clk.AddDate(0, 0, -3)),
		"cutoff must be dated from the server clock, got %v", e.repo.purgedBefore)
}

// The one rule that outranks the window: a clean-up must not sign out the
// admin who asked for it.
func TestSessions_PurgeNeverDeletesTheCallersOwnSessions(t *testing.T) {
	e := newTestSvc(t)
	actor := admintest.ActorWith(permKill)
	me := e.repo.addUser("me@x.test")
	me.id = actor.UserID
	e.repo.users[actor.UserID] = me
	mine := e.repo.addSessionAged(actor.UserID, 400)

	other := e.repo.addUser("other@x.test")
	e.repo.addSessionAged(other.id, 400)

	res, err := e.svc.PurgeSessions(ctx(), actor, "all")
	require.NoError(t, err)
	require.EqualValues(t, 1, res.Deleted)
	require.Contains(t, e.repo.sessions, mine, "the acting admin keeps their own session")
	require.Equal(t, actor.UserID, e.repo.purgedKeeping)
}

func TestSessions_PurgeAllClearsEverythingElse(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("u@x.test")
	e.repo.addSessionAged(u.id, 0)
	e.repo.addSessionAged(u.id, 400)

	res, err := e.svc.PurgeSessions(ctx(), admintest.ActorWith(permKill), "all")
	require.NoError(t, err)
	require.EqualValues(t, 2, res.Deleted)
	require.Empty(t, e.repo.sessions)
	require.True(t, e.repo.purgedBefore.IsZero(), "all means no lower bound")
}

func TestSessions_PurgeAcceptsEveryOfferedWindow(t *testing.T) {
	for _, code := range []string{"all", "3d", "7d", "1m", "3m", "6m", "1y"} {
		e := newTestSvc(t)
		if _, err := e.svc.PurgeSessions(ctx(), admintest.ActorWith(permKill), code); err != nil {
			t.Errorf("window %q rejected: %v", code, err)
		}
	}
}

func TestSessions_PurgeRejectsAWindowNobodyOffers(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("u@x.test")
	e.repo.addSessionAged(u.id, 400)

	_, err := e.svc.PurgeSessions(ctx(), admintest.ActorWith(permKill), "2w")
	admintest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
	require.Len(t, e.repo.sessions, 1, "an unparseable window must not reach the database")
}

// Same gate as the per-row revoke: this is that act in bulk.
func TestSessions_PurgeRequiresTheRevokePermission(t *testing.T) {
	e := newTestSvc(t)
	u := e.repo.addUser("u@x.test")
	e.repo.addSessionAged(u.id, 400)

	_, err := e.svc.PurgeSessions(ctx(), admintest.ActorWith(permRead), "all")
	admintest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")

	_, err = e.svc.PurgeSessions(ctx(), nil, "all")
	admintest.AssertAppErr(t, err, http.StatusUnauthorized, "unauthorized")

	require.Len(t, e.repo.sessions, 1, "a denied purge must not reach the database")
}
