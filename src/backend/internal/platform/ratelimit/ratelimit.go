// Package ratelimit provides ephemeral, per-key request throttling for the
// auth surface (login, 2fa/verify, refresh, forgot, reset). The durable
// lockout counter lives in the DB (users.failed_login_count); this is only the
// fast per-IP / per-email gate. A Redis-backed limiter is used in production
// (multi-instance); an in-memory limiter is the single-instance fallback.
package ratelimit

import (
	"context"
	"math"
	"sync"
	"time"
)

// Limiter gates an action identified by key to at most limit events per window.
type Limiter interface {
	// Allow reports whether the event is permitted. When denied, retryAfter is
	// the whole seconds until the window resets (Retry-After header value).
	Allow(ctx context.Context, key string, limit int, window time.Duration) (allowed bool, retryAfter int, err error)
}

type memoryWindow struct {
	count   int
	resetAt time.Time
}

// MemoryLimiter is an in-process fixed-window limiter. Correct for a single
// instance; use RedisLimiter when running more than one.
type MemoryLimiter struct {
	mu  sync.Mutex
	m   map[string]memoryWindow
	now func() time.Time
}

// NewMemoryLimiter builds an in-memory limiter. now defaults to time.Now.
func NewMemoryLimiter(now func() time.Time) *MemoryLimiter {
	if now == nil {
		now = time.Now
	}
	return &MemoryLimiter{m: make(map[string]memoryWindow), now: now}
}

// Allow implements Limiter.
func (l *MemoryLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) (bool, int, error) {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.m) > 10000 {
		l.sweep(now)
	}
	w, ok := l.m[key]
	if !ok || now.After(w.resetAt) {
		l.m[key] = memoryWindow{count: 1, resetAt: now.Add(window)}
		return true, 0, nil
	}
	if w.count >= limit {
		return false, secondsUntil(w.resetAt, now), nil
	}
	w.count++
	l.m[key] = w
	return true, 0, nil
}

func (l *MemoryLimiter) sweep(now time.Time) {
	for k, w := range l.m {
		if now.After(w.resetAt) {
			delete(l.m, k)
		}
	}
}

func secondsUntil(t, now time.Time) int {
	d := t.Sub(now).Seconds()
	if d <= 0 {
		return 1
	}
	return int(math.Ceil(d))
}
