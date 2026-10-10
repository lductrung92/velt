package settings

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/mail"
	"github.com/velt/backend/internal/platform/ratelimit"
)

type fakeRepo struct {
	snap       snapshot
	applyCount int
}

func (r *fakeRepo) LoadAll(context.Context) (snapshot, error) {
	cp := make(snapshot, len(r.snap))
	for k, v := range r.snap {
		cp[k] = v
	}
	return cp, nil
}

func (r *fakeRepo) Apply(_ context.Context, ops []writeOp, _ uuid.UUID) error {
	r.applyCount++
	for _, op := range ops {
		switch op.Kind {
		case opSetValue:
			r.snap[op.Key] = storedValue{Value: append(json.RawMessage(nil), op.Value...)}
		case opSetEncrypted:
			r.snap[op.Key] = storedValue{Encrypted: append([]byte(nil), op.Encrypted...)}
		case opDelete:
			delete(r.snap, op.Key)
		}
	}
	return nil
}

type fakeCache struct {
	snap        snapshot
	ok          bool
	invalidated int
}

func (c *fakeCache) Get(context.Context) (snapshot, bool) { return c.snap, c.ok }
func (c *fakeCache) Set(_ context.Context, s snapshot)    { c.snap = s; c.ok = true }
func (c *fakeCache) Invalidate(context.Context)           { c.snap = nil; c.ok = false; c.invalidated++ }

type fakeTester struct {
	reason  string
	calls   int
	lastTo  string
	lastCfg mail.SMTPConfig
}

func (f *fakeTester) Test(_ context.Context, cfg mail.SMTPConfig, to string) string {
	f.calls++
	f.lastTo = to
	f.lastCfg = cfg
	return f.reason
}

type tenv struct {
	svc    *Service
	repo   *fakeRepo
	cache  *fakeCache
	tester *fakeTester
}

// errLimiter always errors — used to test fail-closed behavior.
type errLimiter struct{}

func (errLimiter) Allow(context.Context, string, int, time.Duration) (bool, int, error) {
	return false, 0, errString("limiter down")
}

type errString string

func (e errString) Error() string { return string(e) }

func newTestSvc(t *testing.T) *tenv { return newTestSvcWith(t, nil) }

func newTestSvcWith(t *testing.T, rl ratelimit.Limiter) *tenv {
	t.Helper()
	repo := &fakeRepo{snap: snapshot{}}
	cache := &fakeCache{}
	tester := &fakeTester{}
	aead, err := crypto.NewAEAD(bytes.Repeat([]byte{0x3a}, 32))
	require.NoError(t, err)
	now := func() time.Time { return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) }
	if rl == nil {
		rl = ratelimit.NewMemoryLimiter(now)
	}
	svc := NewService(repo, cache, aead, DefaultRegistry(), rl, tester, Options{
		Now:    now,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return &tenv{svc: svc, repo: repo, cache: cache, tester: tester}
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

func adminID() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{"settings.read", "settings.manage"}}
}

func readerID() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{"settings.read"}}
}

// findEntry returns the view entry for a key within a group.
func findEntry(t *testing.T, view GroupedView, group, key string) map[string]any {
	t.Helper()
	for _, e := range view[group] {
		if e["key"] == key {
			return e
		}
	}
	t.Fatalf("entry %s not found in group %s", key, group)
	return nil
}

func assertAppErr(t *testing.T, err error, status int, key string) {
	t.Helper()
	require.Error(t, err)
	ae, ok := apperr.As(err)
	require.True(t, ok, "expected *AppError, got %T: %v", err, err)
	require.Equal(t, status, ae.Status)
	require.Equal(t, key, ae.Key)
}
