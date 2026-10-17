package conversation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// countingLimiter allows the first `budget` calls per key, then refuses. errAt
// makes a given call return an error instead, to exercise the fail-closed path.
type countingLimiter struct {
	budget int
	seen   map[string]int
	err    error
}

func (l *countingLimiter) Allow(_ context.Context, key string, _ int, _ time.Duration) (bool, int, error) {
	if l.err != nil {
		return false, 0, l.err
	}
	if l.seen == nil {
		l.seen = map[string]int{}
	}
	l.seen[key]++
	return l.seen[key] <= l.budget, 42, nil
}

func postStart(h *Handler) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/public/chat/conversations", strings.NewReader("{}"))
	r.Header.Set("Content-Type", "application/json")
	r.RemoteAddr = "203.0.113.9:4567"
	h.Start(rec, r)
	return rec
}

// Starting a conversation mints a fresh ai.max_turns budget, and every message
// inside it is a paid model call. Unthrottled, one script opens unlimited
// conversations and bills every one — which is exactly what this surface did
// before the guard existed.
func TestStartIsCappedPerIP(t *testing.T) {
	e := newEnv(t)
	lim := &countingLimiter{budget: 2}
	h := NewHandler(e.svc, false, lim, false, nil)

	require.Equal(t, http.StatusCreated, postStart(h).Code)
	require.Equal(t, http.StatusCreated, postStart(h).Code)

	over := postStart(h)
	require.Equal(t, http.StatusTooManyRequests, over.Code)
	require.Contains(t, over.Body.String(), "rate_limited")
	// The client is told when to come back rather than left to guess.
	require.Contains(t, over.Body.String(), "42")
}

// Each endpoint gets its own bucket: a visitor mid-conversation must not be cut
// off because someone else exhausted the start budget from the same IP.
func TestEachChatActionHasItsOwnBucket(t *testing.T) {
	e := newEnv(t)
	lim := &countingLimiter{budget: 1}
	h := NewHandler(e.svc, false, lim, false, nil)

	require.Equal(t, http.StatusCreated, postStart(h).Code)
	require.Equal(t, http.StatusTooManyRequests, postStart(h).Code)

	keys := make([]string, 0, len(lim.seen))
	for k := range lim.seen {
		keys = append(keys, k)
	}
	require.Equal(t, []string{"chat:start:ip:203.0.113.9"}, keys)
}

// A limiter outage must not become free inference. Failing open here would mean
// the one surface that spends money is unmetered exactly when nobody is
// watching it.
func TestLimiterFailureClosesTheDoor(t *testing.T) {
	e := newEnv(t)
	h := NewHandler(e.svc, false, &countingLimiter{err: context.DeadlineExceeded}, false, nil)
	require.Equal(t, http.StatusTooManyRequests, postStart(h).Code)
}

// Tests and any future caller that passes no limiter still get a working
// handler — but production wiring must pass one (see ai.Register).
func TestNoLimiterMeansNoThrottle(t *testing.T) {
	e := newEnv(t)
	h := NewHandler(e.svc, false, nil, false, nil)
	for i := 0; i < 5; i++ {
		require.Equal(t, http.StatusCreated, postStart(h).Code)
	}
}
