package settings

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
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

func watch(env *tenv) *fakeRecorder {
	rec := &fakeRecorder{}
	env.svc.SetRecorder(rec)
	return rec
}

// one returns the single recorded entry, failing otherwise.
func (f *fakeRecorder) one(t *testing.T) recorded {
	t.Helper()
	require.Len(t, f.got, 1, "expected exactly one recorded entry")
	return f.got[0]
}

// rowJSON renders a recorded entry the way the store would, so a test can
// assert that a given string is nowhere in the row.
func rowJSON(t *testing.T, r recorded) string {
	t.Helper()
	b, err := json.Marshal(r.entry)
	require.NoError(t, err)
	return string(b)
}

func TestActivity_UpdateRecordsChangedKeys(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)
	id := adminID()

	_, err := env.svc.Update(context.Background(), id, map[string]json.RawMessage{
		"app.name":       raw(`"MyApp"`),
		"mail.smtp_host": raw(`"smtp.test"`),
	})
	require.NoError(t, err)

	got := rec.one(t)
	require.Equal(t, actionUpdated, got.entry.Action)
	require.Equal(t, id.UserID, got.actor.UserID)
	require.Equal(t, []string{"app.name", "mail.smtp_host"}, got.entry.Metadata["keys"],
		"one row per request, keys sorted so the row does not depend on map order")
}

// The rule this module exists to not break: a settings row says WHICH key
// moved, never what it moved to. A secret in the metadata would park plaintext
// in the one table built to be read by people.
func TestActivity_UpdateNeverRecordsASecretValue(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	const secret = "s3cr3t-smtp-passphrase-do-not-log"
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_password": raw(`"` + secret + `"`),
	})
	require.NoError(t, err)

	got := rec.one(t)
	require.Equal(t, []string{"mail.smtp_password"}, got.entry.Metadata["keys"],
		"the key is recorded, so the change is still accountable")
	require.NotContains(t, rowJSON(t, got), secret, "the value must be nowhere in the row")
}

// Non-secret values are left out too: the key list answers the question, and a
// per-key allowlist would be one forgotten IsSecret away from leaking.
func TestActivity_UpdateRecordsNoValuesAtAll(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.name": raw(`"Distinctive Brand Name"`),
	})
	require.NoError(t, err)

	row := rowJSON(t, rec.one(t))
	require.NotContains(t, row, "Distinctive Brand Name")
	require.NotContains(t, row, "Zukatek", "nor the value it replaced")
}

func TestActivity_UpdateScopedRecordsToo(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)
	id := &httpx.Identity{UserID: uuid.New(), Permissions: []string{"cms.settings.manage"}}

	_, err := env.svc.UpdateScoped(context.Background(), id,
		map[string]json.RawMessage{"app.name": raw(`"Velt X"`)}, "app.")
	require.NoError(t, err)

	got := rec.one(t)
	require.Equal(t, actionUpdated, got.entry.Action)
	require.Equal(t, id.UserID, got.actor.UserID)
	require.Equal(t, []string{"app.name"}, got.entry.Metadata["keys"])
}

func TestActivity_RejectedUpdateRecordsNothing(t *testing.T) {
	env := newTestSvc(t)
	rec := watch(env)

	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"mail.smtp_port": raw(`70000`), // out of range
	})
	require.Error(t, err)
	require.Empty(t, rec.got, "nothing was written, so nothing happened")
}

// A service with no recorder must behave exactly as it did before this port
// existed — which is what every other test in this package relies on.
func TestActivity_NilRecorderIsValid(t *testing.T) {
	env := newTestSvc(t)
	_, err := env.svc.Update(context.Background(), adminID(), map[string]json.RawMessage{
		"app.name": raw(`"MyApp"`),
	})
	require.NoError(t, err)
}
