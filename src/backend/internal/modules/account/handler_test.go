package account

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/httpx"
)

func withIdentity(id *httpx.Identity) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if id != nil {
				r = r.WithContext(httpx.WithIdentity(r.Context(), id))
			}
			next.ServeHTTP(w, r)
		})
	}
}

func newTestServer(t *testing.T, withAuth bool) (*httptest.Server, *tenv) {
	t.Helper()
	env := newTestSvc(t)
	h := NewHandler(env.svc, false, "", false)
	r := chi.NewRouter()
	r.Use(httpx.CorrelationID, httpx.Recoverer)
	var mw func(http.Handler) http.Handler
	if withAuth {
		mw = withIdentity(env.id)
	} else {
		mw = withIdentity(nil)
	}
	RegisterRoutes(r, h, mw)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, env
}

func req(t *testing.T, srv *httptest.Server, method, path, body string) *http.Response {
	t.Helper()
	r, err := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	r.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(r)
	require.NoError(t, err)
	return resp
}

func TestHTTP_GetProfile(t *testing.T) {
	srv, _ := newTestServer(t, true)
	resp := req(t, srv, http.MethodGet, "/api/account/profile", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body ProfileResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Equal(t, "user@example.com", body.User.Email)
}

func TestHTTP_Profile_RequiresAuth(t *testing.T) {
	srv, _ := newTestServer(t, false)
	resp := req(t, srv, http.MethodGet, "/api/account/profile", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestHTTP_UpdateProfile(t *testing.T) {
	srv, env := newTestServer(t, true)
	resp := req(t, srv, http.MethodPatch, "/api/account/profile", `{"full_name":"Patched"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "Patched", env.repo.user.FullName)
}

func TestHTTP_ChangePassword_SetsCookie(t *testing.T) {
	srv, _ := newTestServer(t, true)
	resp := req(t, srv, http.MethodPost, "/api/account/change-password",
		`{"current_password":"`+currentPassword+`","new_password":"a-brand-new-password"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var c *http.Cookie
	for _, ck := range resp.Cookies() {
		if ck.Name == "refresh_token" {
			c = ck
		}
	}
	require.NotNil(t, c)
	require.True(t, c.HttpOnly)
	require.NotEmpty(t, c.Value)
}

func TestHTTP_UploadAvatar(t *testing.T) {
	srv, env := newTestServer(t, true)

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "avatar.png")
	require.NoError(t, err)
	_, _ = fw.Write(pngBytes)
	require.NoError(t, mw.Close())

	r, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/account/avatar", &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := srv.Client().Do(r)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Contains(t, body["avatar_url"], "/api/files/users/")
	require.NotNil(t, env.repo.user.AvatarPath)
}

func TestHTTP_Setup2FA(t *testing.T) {
	srv, _ := newTestServer(t, true)
	resp := req(t, srv, http.MethodPost, "/api/account/2fa/setup", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var body SetupResult
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.NotEmpty(t, body.OtpauthURL)
	require.Contains(t, body.QRSVG, "<svg")
}
