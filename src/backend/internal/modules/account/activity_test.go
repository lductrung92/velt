package account

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// recorded is one call to the fake recorder: the actor and the entry.
type recorded struct {
	actor *httpx.Identity
	entry activity.Entry
}

// fakeRecorder collects entries instead of writing them. It is attached with
// the setter, so the shared fixture stays recorder-less and keeps proving that
// nil is a valid recorder.
type fakeRecorder struct{ got []recorded }

func (f *fakeRecorder) Record(_ context.Context, id *httpx.Identity, e activity.Entry) {
	f.got = append(f.got, recorded{actor: id, entry: e})
}

func (f *fakeRecorder) actions() []string {
	out := make([]string, 0, len(f.got))
	for _, r := range f.got {
		out = append(out, r.entry.Action)
	}
	return out
}

// only returns the single entry with the given action, failing otherwise.
func (f *fakeRecorder) only(t *testing.T, action string) recorded {
	t.Helper()
	var found []recorded
	for _, r := range f.got {
		if r.entry.Action == action {
			found = append(found, r)
		}
	}
	require.Len(t, found, 1, "expected exactly one %s, got %v", action, f.actions())
	return found[0]
}

func watch(env *tenv) *fakeRecorder {
	rec := &fakeRecorder{}
	env.svc.SetRecorder(rec)
	return rec
}

// rowJSON renders a recorded entry the way the store would, so a test can
// assert that a given string is nowhere in the row.
func rowJSON(t *testing.T, r recorded) string {
	t.Helper()
	b, err := json.Marshal(r.entry)
	require.NoError(t, err)
	return string(b)
}

func TestActivity_ProfileUpdated(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	_, err := env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: "New Name"})
	require.NoError(t, err)

	got := rec.only(t, actionProfileUpdated)
	require.Equal(t, env.id.UserID, got.actor.UserID)
	require.Equal(t, entityUser, got.entry.Entity)
	require.Equal(t, env.id.UserID, *got.entry.EntityID)
	require.Equal(t, "full_name", got.entry.Metadata["field"])
	require.Equal(t, "Old Name", got.entry.Metadata["from"])
	require.Equal(t, "New Name", got.entry.Metadata["to"])
}

func TestActivity_ProfileUnchangedRecordsNothing(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	_, err := env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: "  Old Name  "})
	require.NoError(t, err)
	require.Empty(t, rec.actions(), "saving the form unedited is not an activity")
}

func TestActivity_PasswordChanged_NeverRecordsThePassword(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	const newPassword = "a-brand-new-passphrase"
	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: currentPassword, NewPassword: newPassword},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)

	got := rec.only(t, actionPasswordChanged)
	require.Equal(t, env.id.UserID, got.actor.UserID)
	require.Equal(t, env.id.UserID, *got.entry.EntityID)
	row := rowJSON(t, got)
	require.NotContains(t, row, newPassword)
	require.NotContains(t, row, currentPassword)
}

func TestActivity_PasswordChangeRejectedRecordsNothing(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	_, err := env.svc.ChangePassword(context.Background(), env.id,
		ChangePasswordRequest{CurrentPassword: "wrong", NewPassword: "a-brand-new-passphrase"},
		RequestMeta{IP: "1.2.3.4"})
	require.Error(t, err)
	require.Empty(t, rec.actions())
}

func TestActivity_TwoFactorEnabledAndDisabled(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	rec := watch(env)

	_, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	require.NoError(t, err)
	on := rec.only(t, actionTwoFactorOn)
	require.Equal(t, env.id.UserID, on.actor.UserID)
	require.Equal(t, env.id.UserID, *on.entry.EntityID)

	require.NoError(t, env.svc.DisableTwoFactor(context.Background(), env.id,
		Password2FARequest{Password: currentPassword}))
	off := rec.only(t, actionTwoFactorOff)
	require.Equal(t, env.id.UserID, off.actor.UserID)
	require.NotContains(t, rowJSON(t, off), currentPassword, "the re-auth password is not evidence")
}

func TestActivity_RecoveryCodesRegenerated(t *testing.T) {
	env := newTestSvc(t)
	_, code := setupAndCode(t, env)
	_, err := env.svc.EnableTwoFactor(context.Background(), env.id, Enable2FARequest{Code: code})
	require.NoError(t, err)
	rec := watch(env)

	codes, err := env.svc.RegenerateRecoveryCodes(context.Background(), env.id,
		Password2FARequest{Password: currentPassword})
	require.NoError(t, err)

	got := rec.only(t, actionRecoveryCodesNew)
	row := rowJSON(t, got)
	for _, c := range codes {
		require.NotContains(t, row, c, "recovery codes are credentials")
	}
}

// A service with no recorder must behave exactly as it did before this port
// existed — which is what every other test in this package relies on.
func TestActivity_NilRecorderIsValid(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.UpdateProfile(context.Background(), env.id, UpdateProfileRequest{FullName: "New Name"})
	require.NoError(t, err)
}
