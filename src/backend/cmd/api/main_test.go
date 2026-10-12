package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Every endpoint but one answers and returns, so a request deadline is a safety
// net. An SSE stream never returns on its own: the same deadline turns into a
// guaranteed cut-off, and the visitor loses the answer the assistant is still
// writing.
func TestTimeoutExceptStreams(t *testing.T) {
	const limit = 50 * time.Millisecond

	// A handler that outlives the deadline and reports whether its context died.
	var cancelled bool
	h := timeoutExceptStreams(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			cancelled = true
		case <-time.After(4 * limit):
		}
		w.WriteHeader(http.StatusOK)
	}))

	for _, tc := range []struct {
		path      string
		cancelled bool
	}{
		{"/api/public/chat/conversations/abc/stream", false},
		{"/api/public/products", true},
	} {
		cancelled = false
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, tc.path, nil))
		require.Equal(t, tc.cancelled, cancelled, "path %s", tc.path)
	}
}

// chi does not complain about a duplicate route: it silently keeps whichever
// handler was registered last, so which code serves a path depends on the order
// of the Register calls in this file. That is how an unauthenticated
// /api/public/product-categories ended up with two implementations, the losing
// one being an admin read with its permission check removed.
//
// A source scan is crude, but it is the only cheap way to see a collision that
// the router itself hides.
func TestNoRouteIsRegisteredTwice(t *testing.T) {
	route := regexp.MustCompile(`r\.(Get|Post|Put|Patch|Delete|Head)\(\s*"(/[^"]*)"`)
	seen := map[string][]string{}

	root := filepath.Join("..", "..", "internal", "modules")
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") ||
			strings.HasSuffix(path, "_test.go") {
			return err
		}
		src, err := os.ReadFile(path) //nolint:gosec // test-only walk of our own tree
		if err != nil {
			return err
		}
		for _, m := range route.FindAllStringSubmatch(string(src), -1) {
			// Only absolute paths: a r.Route("/api/x") subtree registers
			// relative children, which collide only within that subtree.
			if !strings.HasPrefix(m[2], "/api/") {
				continue
			}
			k := m[1] + " " + m[2]
			seen[k] = append(seen[k], filepath.ToSlash(path))
		}
		return nil
	})
	require.NoError(t, err)
	require.NotEmpty(t, seen, "the scan found no routes at all — the pattern drifted")

	for k, files := range seen {
		require.Lenf(t, files, 1, "%s is registered %d times: %v", k, len(files), files)
	}
}
