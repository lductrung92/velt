package settings

import (
	"encoding/json"
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
			next.ServeHTTP(w, r.WithContext(httpx.WithIdentity(r.Context(), id)))
		})
	}
}

func newTestServer(t *testing.T) (*httptest.Server, *tenv) {
	t.Helper()
	env := newTestSvc(t)
	r := chi.NewRouter()
	r.Use(httpx.CorrelationID, httpx.Recoverer)
	RegisterRoutes(r, NewHandler(env.svc), withIdentity(adminID()))
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, env
}

func do(t *testing.T, srv *httptest.Server, method, path, body string) *http.Response {
	t.Helper()
	var rdr *strings.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	} else {
		rdr = strings.NewReader("")
	}
	req, err := http.NewRequest(method, srv.URL+path, rdr)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	return resp
}

func TestHTTP_GetAll(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodGet, "/api/settings", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var view map[string][]map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&view))
	require.Contains(t, view, "general")
	require.Contains(t, view, "email")
	require.Contains(t, view, "storage")
}

func TestHTTP_Update(t *testing.T) {
	srv, env := newTestServer(t)
	resp := do(t, srv, http.MethodPut, "/api/settings", `{"updates":{"app.name":"Renamed"}}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 1, env.repo.applyCount)
}

func TestHTTP_Update_BadJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodPut, "/api/settings", `{bad`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestHTTP_Update_UnknownKey(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodPut, "/api/settings", `{"updates":{"nope.key":1}}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode)
}

func TestHTTP_GetPublic_NoAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodGet, "/api/public/settings", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var out map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	require.Contains(t, out, "app.name")
	require.NotContains(t, out, "mail.smtp_host")
}

func TestHTTP_GetPublic_CacheHeaders(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodGet, "/api/public/settings", "")
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	etag := resp.Header.Get("ETag")
	require.NotEmpty(t, etag)
	require.Contains(t, resp.Header.Get("Cache-Control"), "max-age")

	// Conditional GET with the ETag → 304 Not Modified.
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/public/settings", nil)
	req.Header.Set("If-None-Match", etag)
	resp2, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = resp2.Body.Close() }()
	require.Equal(t, http.StatusNotModified, resp2.StatusCode)
}

func TestHTTP_TestEmail_NotConfigured(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := do(t, srv, http.MethodPost, "/api/settings/email/test", `{"to":"a@b.com"}`)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusBadGateway, resp.StatusCode)

	var body struct {
		Error struct {
			Message string         `json:"message"`
			Details map[string]any `json:"details"`
		} `json:"error"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Equal(t, "smtp_test_failed", body.Error.Message)
	require.Equal(t, "not_configured", body.Error.Details["reason"])
}
