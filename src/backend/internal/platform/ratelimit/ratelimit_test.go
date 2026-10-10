package ratelimit

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type clock struct{ t time.Time }

func (c *clock) Now() time.Time { return c.t }

func TestMemoryLimiter_AllowsUpToLimit(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	l := NewMemoryLimiter(clk.Now)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		ok, retry, err := l.Allow(ctx, "k", 3, time.Minute)
		require.NoError(t, err)
		require.True(t, ok, "attempt %d should be allowed", i)
		require.Zero(t, retry)
	}

	ok, retry, err := l.Allow(ctx, "k", 3, time.Minute)
	require.NoError(t, err)
	require.False(t, ok, "4th attempt over limit must be denied")
	require.Positive(t, retry)
}

func TestMemoryLimiter_ResetsAfterWindow(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	l := NewMemoryLimiter(clk.Now)
	ctx := context.Background()

	_, _, _ = l.Allow(ctx, "k", 1, time.Minute)
	ok, _, _ := l.Allow(ctx, "k", 1, time.Minute)
	require.False(t, ok)

	clk.t = clk.t.Add(61 * time.Second) // window elapsed
	ok, _, err := l.Allow(ctx, "k", 1, time.Minute)
	require.NoError(t, err)
	require.True(t, ok, "limit should reset after the window")
}

func TestMemoryLimiter_KeysAreIndependent(t *testing.T) {
	clk := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	l := NewMemoryLimiter(clk.Now)
	ctx := context.Background()

	_, _, _ = l.Allow(ctx, "a", 1, time.Minute)
	okA, _, _ := l.Allow(ctx, "a", 1, time.Minute)
	require.False(t, okA)

	okB, _, _ := l.Allow(ctx, "b", 1, time.Minute)
	require.True(t, okB, "a different key has its own window")
}
