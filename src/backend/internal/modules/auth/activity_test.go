package auth

import (
	"context"
	"encoding/json"
	"testing"
	"time"

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
// the setter, so the shared fixtures stay recorder-less and keep proving that
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

// watch attaches a recorder to an existing fixture.
func watch(env *testEnv) *fakeRecorder {
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

func TestActivity_SignIn(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)

	got := rec.only(t, actionSignIn)
	require.NotNil(t, got.actor)
	require.Equal(t, u.ID, got.actor.UserID)
	require.Equal(t, entityUser, got.entry.Entity)
	require.Equal(t, u.ID, *got.entry.EntityID)
	require.Equal(t, "Test User", got.entry.EntityLabel)
	require.Equal(t, methodPassword, got.entry.Metadata["method"])
}

func TestActivity_SignIn_TwoFactorMethod(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)
	u := enroll2FA(t, env)

	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.True(t, res.TwoFactorRequired)
	require.Empty(t, rec.actions(), "the challenge is not a sign-in yet")

	_, err = env.svc.VerifyTwoFactor(context.Background(), TwoFactorVerifyRequest{
		ChallengeToken: res.ChallengeToken,
		Code:           totpCode(t, testTOTPSecret, env.clk.Now()),
	}, RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)

	got := rec.only(t, actionSignIn)
	require.Equal(t, u.ID, got.actor.UserID)
	require.Equal(t, methodTwoFactor, got.entry.Metadata["method"])
}

func TestActivity_SignInFailed_UnknownEmail(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "Nobody@Example.com", Password: "whatever"},
		RequestMeta{IP: "1.2.3.4"})
	require.Error(t, err)

	got := rec.only(t, actionSignInFailed)
	require.Nil(t, got.actor, "nobody authenticated, so the row has no actor")
	require.Empty(t, got.entry.Entity, "there is no account to point at")
	require.Equal(t, "nobody@example.com", got.entry.Metadata["email"])
	require.Equal(t, reasonUnknownEmail, got.entry.Metadata["reason"])
}

// The attempted password is the one thing this row must never carry: a mistyped
// password is very often the right password for some other account.
func TestActivity_SignInFailed_NeverRecordsThePassword(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	const attempted = "hunter2-the-wrong-one"
	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: attempted},
		RequestMeta{IP: "1.2.3.4"})
	require.Error(t, err)

	got := rec.only(t, actionSignInFailed)
	require.Nil(t, got.actor)
	require.Equal(t, u.ID, *got.entry.EntityID, "a known account is the entity")
	require.Equal(t, reasonBadPassword, got.entry.Metadata["reason"])
	require.Equal(t, "alice@example.com", got.entry.Metadata["email"])
	require.NotContains(t, rowJSON(t, got), attempted)
}

func TestActivity_LockedOut(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	for i := 0; i < 5; i++ { // MaxFailedLogins in the fixture
		_, err := env.svc.Login(context.Background(),
			LoginRequest{Email: "alice@example.com", Password: "wrong"},
			RequestMeta{IP: "1.2.3.4"})
		require.Error(t, err)
	}

	got := rec.only(t, actionLockedOut)
	require.Nil(t, got.actor, "the lock is the system's doing, not the owner's")
	require.Equal(t, u.ID, *got.entry.EntityID)
	require.Equal(t, 5, got.entry.Metadata["failed_count"])
	require.NotEmpty(t, got.entry.Metadata["locked_until"])
	require.Len(t, rec.actions(), 6, "five failures plus the lock")
}

func TestActivity_SignInFailed_LockedAccount(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	until := env.clk.Now().Add(time.Hour)
	u.LockedUntil = &until
	rec := watch(env)

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.Error(t, err)

	got := rec.only(t, actionSignInFailed)
	require.Equal(t, reasonAccountLocked, got.entry.Metadata["reason"])
}

func TestActivity_SignInFailed_BadTwoFactorCode(t *testing.T) {
	env := newTestEnv(t)
	u := enroll2FA(t, env)
	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	rec := watch(env)

	_, err = env.svc.VerifyTwoFactor(context.Background(),
		TwoFactorVerifyRequest{ChallengeToken: res.ChallengeToken, Code: "000000"},
		RequestMeta{IP: "1.2.3.4"})
	require.Error(t, err)

	got := rec.only(t, actionSignInFailed)
	require.Nil(t, got.actor)
	require.Equal(t, u.ID, *got.entry.EntityID)
	require.Equal(t, reasonBadTwoFactor, got.entry.Metadata["reason"])
	require.NotContains(t, rowJSON(t, got), "000000", "the submitted code is a credential too")
}

func TestActivity_SignOut(t *testing.T) {
	env := newTestEnv(t)
	u, refresh := loginOnce(t, env)
	rec := watch(env)

	require.NoError(t, env.svc.Logout(context.Background(), refresh))

	got := rec.only(t, actionSignOut)
	require.Equal(t, u.ID, got.actor.UserID)
	require.Equal(t, u.ID, *got.entry.EntityID)
}

func TestActivity_SignOut_UnknownTokenRecordsNothing(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)

	require.NoError(t, env.svc.Logout(context.Background(), "never-issued"))
	require.Empty(t, rec.actions())
}

func TestActivity_SignOutAll(t *testing.T) {
	env := newTestEnv(t)
	u, _ := loginOnce(t, env)
	rec := watch(env)

	require.NoError(t, env.svc.LogoutAll(context.Background(), u.ID))

	got := rec.only(t, actionSignOutAll)
	require.Equal(t, u.ID, got.actor.UserID)
	require.Equal(t, u.ID, *got.entry.EntityID)
}

func TestActivity_PasswordResetRequested(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "alice@example.com"}, RequestMeta{IP: "1.2.3.4"}))

	got := rec.only(t, actionResetRequest)
	require.Nil(t, got.actor, "asking for a reset proves nothing about who asked")
	require.Equal(t, u.ID, *got.entry.EntityID)
}

func TestActivity_PasswordResetRequested_UnknownEmailRecordsNothing(t *testing.T) {
	env := newTestEnv(t)
	rec := watch(env)

	require.NoError(t, env.svc.ForgotPassword(context.Background(),
		ForgotPasswordRequest{Email: "nobody@example.com"}, RequestMeta{IP: "1.2.3.4"}))
	require.Empty(t, rec.actions())
}

func TestActivity_PasswordResetCompleted(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	addResetToken(t, env, u.ID, "raw-token", env.clk.Now().Add(30*time.Minute), nil)
	rec := watch(env)

	const newPassword = "a-brand-new-passphrase"
	require.NoError(t, env.svc.ResetPassword(context.Background(),
		ResetPasswordRequest{Token: "raw-token", NewPassword: newPassword},
		RequestMeta{IP: "1.2.3.4"}))

	got := rec.only(t, actionResetComplete)
	require.Equal(t, u.ID, got.actor.UserID, "the mailed token stands in for the owner")
	require.Equal(t, u.ID, *got.entry.EntityID)
	require.NotContains(t, rowJSON(t, got), newPassword)
	require.NotContains(t, rowJSON(t, got), "raw-token", "the reset token is a credential")
}

// A service with no recorder must behave exactly as it did before this port
// existed — which is what every other test in this package relies on.
func TestActivity_NilRecorderIsValid(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
}
