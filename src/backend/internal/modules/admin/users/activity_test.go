package users

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// fakeRecorder keeps what the service filed, so these tests assert on the row
// itself rather than on a database.
type fakeRecorder struct{ entries []activity.Entry }

func (f *fakeRecorder) Record(_ context.Context, _ *httpx.Identity, e activity.Entry) {
	f.entries = append(f.entries, e)
}

func (f *fakeRecorder) only(t *testing.T) activity.Entry {
	t.Helper()
	require.Len(t, f.entries, 1)
	return f.entries[0]
}

func (e *tenv) withRecorder() *fakeRecorder {
	rec := &fakeRecorder{}
	e.svc.SetActivity(rec)
	return rec
}

// A hard delete leaves nothing behind to resolve the id against, so the name
// and address have to be on the row itself.
func TestActivity_HardDeleteKeepsWhoItWas(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("gone@x.test", statusActive)
	rec := e.withRecorder()

	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, true))

	entry := rec.only(t)
	require.Equal(t, "user.deleted", entry.Action)
	require.Equal(t, entityUser, entry.Entity)
	require.Equal(t, target.ID, *entry.EntityID)
	require.Equal(t, "User gone@x.test", entry.EntityLabel)
	require.Equal(t, "gone@x.test", entry.Metadata["email"])
	require.NotContains(t, e.repo.users, target.ID)
}

// The default delete only disables the account, and says so rather than
// claiming a deletion that did not happen.
func TestActivity_SoftDeleteIsRecordedAsDisabled(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("off@x.test", statusActive)
	rec := e.withRecorder()

	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, false))

	entry := rec.only(t)
	require.Equal(t, "user.disabled", entry.Action)
	require.Equal(t, true, entry.Metadata["soft_delete"])
}

// A granted role is named by its code, which is what the console filters and
// what still reads correctly if the role is renamed later.
func TestActivity_RoleGrantNamesTheRole(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("staff@x.test", statusActive)
	role := e.repo.addRole("support", "Support", false, "reports.view")
	rec := e.withRecorder()

	require.NoError(t, e.svc.AssignRole(ctx(), e.superActor(), target.ID, role.ID))

	entry := rec.only(t)
	require.Equal(t, "user.role_assigned", entry.Action)
	require.Equal(t, "User staff@x.test", entry.EntityLabel)
	require.Equal(t, "support", entry.Metadata["role"])
}

// The recorder is optional by design: every other test in this package runs
// without one, and this is the assertion that keeps that true.
func TestActivity_NilRecorderIsSafe(t *testing.T) {
	e := newTestSvc(t)
	target := e.repo.addUser("x@x.test", statusActive)
	require.NoError(t, e.svc.DeleteUser(ctx(), e.superActor(), target.ID, true))
}
