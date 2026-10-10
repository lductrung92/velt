package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func corsHandler() http.Handler {
	mw := CORS([]string{"https://admin.velt.local.vn"})
	return mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
}

func TestCORS_AllowedOrigin(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	r.Header.Set("Origin", "https://admin.velt.local.vn")
	corsHandler().ServeHTTP(rec, r)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "https://admin.velt.local.vn", rec.Header().Get("Access-Control-Allow-Origin"))
	require.Equal(t, "true", rec.Header().Get("Access-Control-Allow-Credentials"))
	require.Contains(t, rec.Header().Values("Vary"), "Origin")
}

func TestCORS_Preflight(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodOptions, "/api/auth/login", nil)
	r.Header.Set("Origin", "https://admin.velt.local.vn")
	corsHandler().ServeHTTP(rec, r)

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, "https://admin.velt.local.vn", rec.Header().Get("Access-Control-Allow-Origin"))
	require.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), "POST")
	require.Contains(t, rec.Header().Get("Access-Control-Allow-Headers"), "Authorization")
}

func TestCORS_DisallowedOrigin(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/public/settings", nil)
	r.Header.Set("Origin", "https://evil.example.com")
	corsHandler().ServeHTTP(rec, r)

	// Request still served, but with NO CORS headers → the browser blocks the
	// response from the disallowed origin.
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORS_NoOrigin_PassThrough(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/healthz", nil) // same-origin / curl: no Origin
	corsHandler().ServeHTTP(rec, r)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
}
