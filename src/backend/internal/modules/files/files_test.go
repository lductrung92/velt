package files

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/storage"
)

func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	store := storage.NewLocal(t.TempDir())
	ctx := context.Background()
	require.NoError(t, store.Save(ctx, "users/abc/avatar-xyz.png", bytes.NewReader([]byte("\x89PNG"))))
	require.NoError(t, store.Save(ctx, "secret/data.txt", bytes.NewReader([]byte("private"))))

	r := chi.NewRouter()
	RegisterRoutes(r, NewHandler(store, []string{"users/"}))
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv
}

func TestServe_PublicPrefix(t *testing.T) {
	srv := newServer(t)
	resp, err := http.Get(srv.URL + "/api/files/users/abc/avatar-xyz.png")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
	require.Contains(t, resp.Header.Get("Content-Type"), "image/png")
}

func TestServe_NonPublicPrefix_NotFound(t *testing.T) {
	srv := newServer(t)
	// A file that exists under storage root but NOT under an allowlisted prefix
	// must not be served (no private-file leak).
	resp, err := http.Get(srv.URL + "/api/files/secret/data.txt")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestServe_Missing_NotFound(t *testing.T) {
	srv := newServer(t)
	resp, err := http.Get(srv.URL + "/api/files/users/abc/nope.png")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}
