package main

import (
	"net/http"
	"net/http/httptest"
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
