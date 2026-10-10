package auth

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
)

func loginOnce(t *testing.T, env *testEnv) (*User, string) {
	t.Helper()
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	res, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.RefreshToken)
	return u, res.RefreshToken
}

func TestRefresh_RotatesAndIssuesNew(t *testing.T) {
	env := newTestEnv(t)
	_, refresh := loginOnce(t, env)

	res, err := env.svc.Refresh(context.Background(), refresh, RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	require.NotEmpty(t, res.AccessToken)
	require.NotEmpty(t, res.RefreshToken)
	require.NotEqual(t, refresh, res.RefreshToken, "refresh token must rotate")

	// Old session is revoked.
	old, err := env.repo.GetSessionByRefreshHash(context.Background(), crypto.HashToken(refresh))
	require.NoError(t, err)
	require.NotNil(t, old.RevokedAt)
}

func TestRefresh_ReuseDetection_RevokesAll(t *testing.T) {
	env := newTestEnv(t)
	_, refresh := loginOnce(t, env)

	// First refresh rotates (old token now revoked).
	_, err := env.svc.Refresh(context.Background(), refresh, RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)

	// Reusing the old, already-revoked token → theft signal → revoke all.
	_, err = env.svc.Refresh(context.Background(), refresh, RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
	require.GreaterOrEqual(t, env.repo.revokeAllCalls, 1)
}

func TestRefresh_ExpiredSession(t *testing.T) {
	env := newTestEnv(t)
	u, refresh := loginOnce(t, env)
	// Force the session to be expired.
	id := env.repo.byHash[crypto.HashToken(refresh)]
	env.repo.sessions[id].ExpiresAt = env.clk.Now().Add(-time.Hour)
	_ = u

	_, err := env.svc.Refresh(context.Background(), refresh, RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

func TestRefresh_UnknownToken(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Refresh(context.Background(), "totally-unknown", RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

func TestRefresh_EmptyCookie(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Refresh(context.Background(), "", RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

func TestRefresh_DisabledUser(t *testing.T) {
	env := newTestEnv(t)
	u, refresh := loginOnce(t, env)
	u.Status = statusDisabled

	_, err := env.svc.Refresh(context.Background(), refresh, RequestMeta{IP: "1.2.3.4"})
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
	// Session should have been revoked.
	id := env.repo.byHash[crypto.HashToken(refresh)]
	require.NotNil(t, env.repo.sessions[id].RevokedAt)
}

func TestLogout_RevokesCurrentSession(t *testing.T) {
	env := newTestEnv(t)
	_, refresh := loginOnce(t, env)

	require.NoError(t, env.svc.Logout(context.Background(), refresh))
	id := env.repo.byHash[crypto.HashToken(refresh)]
	require.NotNil(t, env.repo.sessions[id].RevokedAt)
}

func TestLogout_UnknownToken_Idempotent(t *testing.T) {
	env := newTestEnv(t)
	require.NoError(t, env.svc.Logout(context.Background(), "nope"))
	require.NoError(t, env.svc.Logout(context.Background(), ""))
}

func TestLogoutAll_RevokesEverySession(t *testing.T) {
	env := newTestEnv(t)
	u, _ := loginOnce(t, env)
	// Second session for the same user.
	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "5.6.7.8"})
	require.NoError(t, err)
	require.Equal(t, 2, env.repo.activeSessionCount(u.ID, env.clk.Now()))

	require.NoError(t, env.svc.LogoutAll(context.Background(), u.ID))
	require.Equal(t, 0, env.repo.activeSessionCount(u.ID, env.clk.Now()))
}

func TestMe_Success(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	env.repo.roles[u.ID] = []string{"editor"}
	env.repo.perms[u.ID] = []string{}

	res, err := env.svc.Me(context.Background(), u.ID)
	require.NoError(t, err)
	require.Equal(t, "alice@example.com", res.User.Email)
	require.Equal(t, []string{"editor"}, res.Roles)
}

func TestMe_UnknownUser(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.Me(context.Background(), uuid.New())
	assertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

func TestLogin_SessionCapEvictsOldest(t *testing.T) {
	env := newTestEnv(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	// Pre-seed sessions at the cap (10).
	for i := 0; i < 10; i++ {
		env.clk.Advance(time.Second)
		require.NoError(t, env.repo.CreateSession(context.Background(), &Session{
			ID: uuid.New(), UserID: u.ID, RefreshTokenHash: crypto.HashToken(uuid.NewString()),
			CreatedAt: env.clk.Now(), ExpiresAt: env.clk.Now().Add(720 * time.Hour),
		}))
	}
	require.Equal(t, 10, env.repo.activeSessionCount(u.ID, env.clk.Now()))

	_, err := env.svc.Login(context.Background(),
		LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"},
		RequestMeta{IP: "1.2.3.4"})
	require.NoError(t, err)
	// Cap holds: oldest evicted, new one created.
	require.Equal(t, 10, env.repo.activeSessionCount(u.ID, env.clk.Now()))
}
