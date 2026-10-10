package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/config"
	"github.com/velt/backend/internal/httpx"
)

const refreshCookieName = config.RefreshCookieName

// newTestServer builds the full chi router with middleware + auth routes over a
// fake repo, returning the env so tests can seed data.
func newTestServer(t *testing.T) (*httptest.Server, *testEnv) {
	t.Helper()
	env := newTestEnv(t)
	h := NewHandler(env.svc, false, "", false)
	r := chi.NewRouter()
	r.Use(httpx.CorrelationID, httpx.Recoverer)
	RegisterRoutes(r, h, httpx.Authenticator(env.tokens))
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, env
}

func postJSON(t *testing.T, srv *httptest.Server, path, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	return resp
}

func findCookie(resp *http.Response, name string) *http.Cookie {
	for _, c := range resp.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestHTTP_Login_Success_SetsCookie(t *testing.T) {
	srv, env := newTestServer(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")

	resp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body loginResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.AccessToken)
	require.Equal(t, "Bearer", body.TokenType)

	c := findCookie(resp, refreshCookieName)
	require.NotNil(t, c)
	require.True(t, c.HttpOnly)
	require.NotEmpty(t, c.Value)
}

func TestHTTP_Login_BadJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/login", `{bad`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestHTTP_Login_ValidationError(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/login", `{"email":"not-email","password":""}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode)
}

func TestHTTP_Login_WrongPassword(t *testing.T) {
	srv, env := newTestServer(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	resp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"nope"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHTTP_Me_RequiresAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHTTP_Me_WithToken(t *testing.T) {
	srv, env := newTestServer(t)
	u := env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	env.repo.roles[u.ID] = []string{"admin"}

	// Login to obtain an access token.
	loginResp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	var lb loginResponse
	require.NoError(t, json.NewDecoder(loginResp.Body).Decode(&lb))
	_ = loginResp.Body.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+lb.AccessToken)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var me MeResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&me))
	require.Equal(t, "alice@example.com", me.User.Email)
	require.Equal(t, []string{"admin"}, me.Roles)
}

func TestHTTP_Refresh_RotatesCookie(t *testing.T) {
	srv, env := newTestServer(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	loginResp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	_ = loginResp.Body.Close()
	cookie := findCookie(loginResp, refreshCookieName)
	require.NotNil(t, cookie)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/refresh", nil)
	req.AddCookie(cookie)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	newCookie := findCookie(resp, refreshCookieName)
	require.NotNil(t, newCookie)
	require.NotEqual(t, cookie.Value, newCookie.Value, "refresh cookie must rotate")
}

func TestHTTP_Refresh_NoCookie_ClearsAnd401(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/refresh", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	c := findCookie(resp, refreshCookieName)
	require.NotNil(t, c)
	require.True(t, c.MaxAge < 0, "cookie should be cleared")
}

func TestHTTP_Logout_ClearsCookie(t *testing.T) {
	srv, env := newTestServer(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	loginResp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	_ = loginResp.Body.Close()
	cookie := findCookie(loginResp, refreshCookieName)

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/logout", nil)
	req.AddCookie(cookie)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	c := findCookie(resp, refreshCookieName)
	require.NotNil(t, c)
	require.True(t, c.MaxAge < 0)
}

func TestHTTP_ForgotPassword_Always200(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/forgot-password", `{"email":"ghost@example.com"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var ok okResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&ok))
	require.True(t, ok.OK)
}

func TestHTTP_ResetPassword_InvalidToken(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/reset-password", `{"token":"nope","new_password":"brand-new-password"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode)
}

func TestHTTP_LogoutAll_RequiresAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/logout-all", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHTTP_LogoutAll_WithToken(t *testing.T) {
	srv, env := newTestServer(t)
	env.repo.addUser(t, "alice@example.com", "correct-horse-battery")
	loginResp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	var lb loginResponse
	require.NoError(t, json.NewDecoder(loginResp.Body).Decode(&lb))
	_ = loginResp.Body.Close()

	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/logout-all", nil)
	req.Header.Set("Authorization", "Bearer "+lb.AccessToken)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	require.GreaterOrEqual(t, env.repo.revokeAllCalls, 1)
}

func TestHTTP_VerifyTwoFactor_BadJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/auth/2fa/verify", `{bad`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestHTTP_VerifyTwoFactor_Success(t *testing.T) {
	srv, env := newTestServer(t)
	u := enroll2FA(t, env)

	// Step 1: password login returns a challenge token.
	loginResp := postJSON(t, srv, "/api/auth/login", `{"email":"alice@example.com","password":"correct-horse-battery"}`)
	var ch challengeResponse
	require.NoError(t, json.NewDecoder(loginResp.Body).Decode(&ch))
	_ = loginResp.Body.Close()
	require.True(t, ch.TwoFactorRequired)

	// Step 2: verify with a valid TOTP code.
	code := totpCode(t, testTOTPSecret, env.clk.Now())
	resp := postJSON(t, srv, "/api/auth/2fa/verify",
		`{"challenge_token":"`+ch.ChallengeToken+`","code":"`+code+`"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var lb loginResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&lb))
	require.NotEmpty(t, lb.AccessToken)
	require.NotNil(t, findCookie(resp, refreshCookieName))
	_ = u
}
