package newsletter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// fakeLimiter denies any rate-limit key containing denySub (so a test can target
// the IP bucket or the email bucket independently).
type fakeLimiter struct{ denySub string }

func (f fakeLimiter) Allow(_ context.Context, key string, _ int, _ time.Duration) (bool, int, error) {
	if f.denySub != "" && strings.Contains(key, f.denySub) {
		return false, 60, nil
	}
	return true, 0, nil
}

func postSubscribe(t *testing.T, env *tenv, lim fakeLimiter, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := &PublicHandler{svc: env.svc, limiter: lim, trustProxy: false}
	req := httptest.NewRequest(http.MethodPost, "/api/public/cms/newsletter/subscribe", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "9.9.9.9:5555"
	w := httptest.NewRecorder()
	h.Subscribe(w, req)
	return w
}

func countSubscribers(t *testing.T, env *tenv) int {
	t.Helper()
	_, total, err := env.repo.ListSubscribers(context.Background(), ListParams{Page: 1, PageSize: 10})
	require.NoError(t, err)
	return total
}

func TestSubscribeHandler_Allowed(t *testing.T) {
	env := newTestSvc(t)
	w := postSubscribe(t, env, fakeLimiter{}, `{"email":"a@b.com","source":"landing"}`)
	require.Equal(t, http.StatusAccepted, w.Code)
	require.Equal(t, 1, countSubscribers(t, env))
}

func TestSubscribeHandler_IPRateLimited(t *testing.T) {
	env := newTestSvc(t)
	w := postSubscribe(t, env, fakeLimiter{denySub: "ip:"}, `{"email":"a@b.com"}`)
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	require.Equal(t, 0, countSubscribers(t, env), "a denied request must not persist")
}

func TestSubscribeHandler_EmailRateLimited(t *testing.T) {
	env := newTestSvc(t)
	// IP bucket passes; the per-email bucket is over the limit.
	w := postSubscribe(t, env, fakeLimiter{denySub: "email:"}, `{"email":"a@b.com"}`)
	require.Equal(t, http.StatusTooManyRequests, w.Code)
	require.Equal(t, 0, countSubscribers(t, env))
}

func TestSubscribeHandler_InvalidEmail(t *testing.T) {
	env := newTestSvc(t)
	w := postSubscribe(t, env, fakeLimiter{}, `{"email":"not-an-email"}`)
	require.Equal(t, http.StatusUnprocessableEntity, w.Code)
	require.Equal(t, 0, countSubscribers(t, env))
}
