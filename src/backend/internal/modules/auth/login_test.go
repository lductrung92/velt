package auth

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestLogin_Success_NoTwoFactor(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	env.repo.roles[u.ID] = []string{"admin"}
	env.repo.perms[u.ID] = []string{"users.read"}

	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4", UserAgent: "test"})
	require.NoError(t, err)
	require.False(t, res.TwoFactorRequired)
	require.NotEmpty(t, res.AccessToken)
	require.NotEmpty(t, res.RefreshToken)
	require.Equal(t, 900, res.ExpiresIn)
	require.Equal(t, "alice@example.com", res.User.Email)
	require.Equal(t, 1, env.repo.markSuccess)
	require.Equal(t, 1, env.repo.createSessions)

	// Access token carries resolved roles/permissions.
	uid, roles, perms, err := env.tokens.ParseAccess(res.AccessToken)
	require.NoError(t, err)
	require.Equal(t, u.ID, uid)
	require.Equal(t, []string{"admin"}, roles)
	require.Equal(t, []string{"users.read"}, perms)
}

func TestLogin_Success_EmailCaseInsensitive(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "Alice@Example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
}

func TestLogin_WrongPassword(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "wrong"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.Equal(t, 1, env.repo.incrementCalls)
	require.Equal(t, 0, env.repo.markSuccess)
}

func TestLogin_UnknownEmail_SameAsWrongPassword(t *testing.T) {
	env := newTestEnv(t)
	// No user added.
	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "ghost@example.com", Password: "whatever12345"},
		RequestMeta{IP: "1.2.3.4"})
	// Identical generic error, and no per-user increment (user doesn't exist).
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.Equal(t, 0, env.repo.incrementCalls)
}

func TestLogin_LockedAndCorrectPassword_ReturnsLocked(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	future := env.clk.Now().Add(10 * time.Minute)
	u.LockedUntil = &future

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "account_locked")
}

func TestLogin_LockedButWrongPassword_StaysGeneric(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	future := env.clk.Now().Add(10 * time.Minute)
	u.LockedUntil = &future

	// Wrong password while locked must NOT reveal the lock (anti-enumeration).
	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "wrong"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
}

func TestLogin_ExpiredLock_AllowsLogin(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	past := env.clk.Now().Add(-1 * time.Minute)
	u.LockedUntil = &past

	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
}

func TestLogin_Disabled_CorrectPassword(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	u.Status = statusDisabled

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusForbidden, "account_disabled")
}

func TestLogin_LockoutTriggersAtThreshold(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	u.FailedLoginCount = 4 // next failure is the 5th → lock

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "wrong"},
		RequestMeta{IP: "9.9.9.9"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.Equal(t, 1, env.repo.incrementCalls)
	require.NotNil(t, env.repo.lastLockedAt, "5th failure should set locked_until")
}

func TestLogin_BelowThreshold_NoLock(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	u.FailedLoginCount = 1

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "wrong"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "invalid_credentials")
	require.Nil(t, env.repo.lastLockedAt)
}

func TestLogin_TwoFactorEnabled_ReturnsChallenge(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	enabled := env.clk.Now()
	env.repo.twofactor[u.ID] = &TwoFactor{
		UserID:          u.ID,
		SecretEncrypted: mustEncrypt(t, env, "JBSWY3DPEHPK3PXP"),
		EnabledAt:       &enabled,
	}

	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.True(t, res.TwoFactorRequired)
	require.NotEmpty(t, res.ChallengeToken)
	require.Empty(t, res.AccessToken)
	require.Empty(t, res.RefreshToken)
	require.Equal(t, 0, env.repo.createSessions, "no session before 2FA verify")

	// Challenge token is valid and scoped to this user.
	uid, err := env.tokens.Parse2FAChallenge(res.ChallengeToken)
	require.NoError(t, err)
	require.Equal(t, u.ID, uid)
}

func TestLogin_LimiterError_FailsClosed(t *testing.T) {
	// F5: when the limiter errors, login must fail CLOSED (deny), not open.
	env := newTestEnvWith(t, errLimiter{})
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusTooManyRequests, "rate_limited")
}

func TestRefresh_LimiterError_DegradesOpen(t *testing.T) {
	// F5: refresh prioritizes availability — a limiter error must not block it;
	// it proceeds and fails only on the (missing) token.
	env := newTestEnvWith(t, errLimiter{})
	_, err := env.svc.Refresh(context.Background(), "", RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

func TestLogin_RateLimited(t *testing.T) {
	env := newTestEnv(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	// rlLoginPerEmail = 10 within the window; the 11th attempt is limited.
	var lastErr error
	for i := 0; i < 11; i++ {
		_, lastErr = env.svc.Login(context.Background(),
			LoginRequest{Email: "alice@example.com", Password: "wrong"},
			RequestMeta{IP: "1.2.3.4"})
	}
	assertAppErr(t, lastErr, http.StatusTooManyRequests, "rate_limited")
}
