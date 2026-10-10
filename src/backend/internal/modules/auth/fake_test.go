package auth

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
	"github.com/velt/backend/internal/platform/token"
)

// clock is a controllable time source for deterministic tests.
type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// fakeMailer records the last reset link it was asked to send.
type fakeMailer struct {
	sent     int
	lastTo   string
	lastLink string
	err      error
}

func (m *fakeMailer) SendPasswordReset(_ context.Context, to, resetURL string) error {
	m.sent++
	m.lastTo = to
	m.lastLink = resetURL
	return m.err
}

// fakeRepo is an in-memory Repository for service tests, with call counters for
// the security-relevant operations.
type fakeRepo struct {
	users       map[uuid.UUID]*User
	byEmail     map[string]uuid.UUID
	twofactor   map[uuid.UUID]*TwoFactor
	roles       map[uuid.UUID][]string
	perms       map[uuid.UUID][]string
	sessions    map[uuid.UUID]*Session
	byHash      map[string]uuid.UUID
	resetTokens map[uuid.UUID]*ResetToken
	byTokenHash map[string]uuid.UUID

	incrementCalls int
	lastLockedAt   *time.Time
	markSuccess    int
	revokeAllCalls int
	resetPwCalls   int
	createSessions int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		users:       map[uuid.UUID]*User{},
		byEmail:     map[string]uuid.UUID{},
		twofactor:   map[uuid.UUID]*TwoFactor{},
		roles:       map[uuid.UUID][]string{},
		perms:       map[uuid.UUID][]string{},
		sessions:    map[uuid.UUID]*Session{},
		byHash:      map[string]uuid.UUID{},
		resetTokens: map[uuid.UUID]*ResetToken{},
		byTokenHash: map[string]uuid.UUID{},
	}
}

func (r *fakeRepo) GetUserByEmail(_ context.Context, email string) (*User, error) {
	id, ok := r.byEmail[lower(email)]
	if !ok {
		return nil, ErrNotFound
	}
	u := *r.users[id]
	return &u, nil
}

func (r *fakeRepo) GetUserByID(_ context.Context, id uuid.UUID) (*User, error) {
	u, ok := r.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (r *fakeRepo) IncrementFailedLogin(_ context.Context, userID uuid.UUID, lockedUntil *time.Time) error {
	r.incrementCalls++
	r.lastLockedAt = lockedUntil
	if u, ok := r.users[userID]; ok {
		u.FailedLoginCount++
		if lockedUntil != nil {
			u.LockedUntil = lockedUntil
		}
	}
	return nil
}

func (r *fakeRepo) MarkLoginSuccess(_ context.Context, userID uuid.UUID, at time.Time) error {
	r.markSuccess++
	if u, ok := r.users[userID]; ok {
		u.FailedLoginCount = 0
		u.LockedUntil = nil
		u.LastLoginAt = &at
	}
	return nil
}

func (r *fakeRepo) UpdatePassword(_ context.Context, userID uuid.UUID, hash string) error {
	if u, ok := r.users[userID]; ok {
		u.PasswordHash = hash
	}
	return nil
}

func (r *fakeRepo) GetTwoFactor(_ context.Context, userID uuid.UUID) (*TwoFactor, error) {
	tf, ok := r.twofactor[userID]
	if !ok {
		return nil, ErrNotFound
	}
	return tf, nil
}

func (r *fakeRepo) UpdateTwoFactorUsage(_ context.Context, userID uuid.UUID, newStep *int64, newCodes []RecoveryCode, _ *int64, _ []RecoveryCode) (bool, error) {
	if tf, ok := r.twofactor[userID]; ok {
		tf.LastUsedStep = newStep
		tf.RecoveryCodes = newCodes
	}
	return true, nil
}

func (r *fakeRepo) GetRolesAndPermissions(_ context.Context, userID uuid.UUID) ([]string, []string, error) {
	return r.roles[userID], r.perms[userID], nil
}

func (r *fakeRepo) CountActiveSessions(_ context.Context, userID uuid.UUID, now time.Time) (int, error) {
	n := 0
	for _, s := range r.sessions {
		if s.UserID == userID && s.RevokedAt == nil && s.ExpiresAt.After(now) {
			n++
		}
	}
	return n, nil
}

func (r *fakeRepo) RevokeOldestActiveSession(_ context.Context, userID uuid.UUID, now time.Time) error {
	var oldest *Session
	for _, s := range r.sessions {
		if s.UserID == userID && s.RevokedAt == nil && s.ExpiresAt.After(now) {
			if oldest == nil || s.CreatedAt.Before(oldest.CreatedAt) {
				oldest = s
			}
		}
	}
	if oldest != nil {
		t := now
		oldest.RevokedAt = &t
	}
	return nil
}

func (r *fakeRepo) CreateSession(_ context.Context, s *Session) error {
	r.createSessions++
	cp := *s
	r.sessions[s.ID] = &cp
	r.byHash[s.RefreshTokenHash] = s.ID
	return nil
}

func (r *fakeRepo) GetSessionByRefreshHash(_ context.Context, hash string) (*Session, error) {
	id, ok := r.byHash[hash]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *r.sessions[id]
	return &cp, nil
}

func (r *fakeRepo) RevokeSession(_ context.Context, id uuid.UUID, at time.Time) error {
	if s, ok := r.sessions[id]; ok && s.RevokedAt == nil {
		t := at
		s.RevokedAt = &t
	}
	return nil
}

func (r *fakeRepo) RevokeAllUserSessions(_ context.Context, userID uuid.UUID, at time.Time) error {
	r.revokeAllCalls++
	for _, s := range r.sessions {
		if s.UserID == userID && s.RevokedAt == nil {
			t := at
			s.RevokedAt = &t
		}
	}
	return nil
}

func (r *fakeRepo) RotateSession(_ context.Context, oldID uuid.UUID, newSession *Session, at time.Time) error {
	if s, ok := r.sessions[oldID]; ok {
		t := at
		s.RevokedAt = &t
		s.LastUsedAt = &t
	}
	r.createSessions++
	cp := *newSession
	r.sessions[newSession.ID] = &cp
	r.byHash[newSession.RefreshTokenHash] = newSession.ID
	return nil
}

func (r *fakeRepo) InvalidateUserResetTokens(_ context.Context, userID uuid.UUID, at time.Time) error {
	for _, t := range r.resetTokens {
		if t.UserID == userID && t.UsedAt == nil {
			ts := at
			t.UsedAt = &ts
		}
	}
	return nil
}

func (r *fakeRepo) CreateResetToken(_ context.Context, t *ResetToken) error {
	cp := *t
	r.resetTokens[t.ID] = &cp
	r.byTokenHash[t.TokenHash] = t.ID
	return nil
}

func (r *fakeRepo) GetResetTokenByHash(_ context.Context, hash string) (*ResetToken, error) {
	id, ok := r.byTokenHash[hash]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *r.resetTokens[id]
	return &cp, nil
}

func (r *fakeRepo) ResetPassword(_ context.Context, userID uuid.UUID, hash string, tokenID uuid.UUID, at time.Time) error {
	r.resetPwCalls++
	if u, ok := r.users[userID]; ok {
		u.PasswordHash = hash
	}
	if t, ok := r.resetTokens[tokenID]; ok {
		ts := at
		t.UsedAt = &ts
	}
	for _, s := range r.sessions {
		if s.UserID == userID && s.RevokedAt == nil {
			ts := at
			s.RevokedAt = &ts
		}
	}
	return nil
}

// --- helpers ---

func lower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}

func (r *fakeRepo) addUser(t *testing.T, email, password string) *User {
	t.Helper()
	hash, err := crypto.HashPassword(password)
	require.NoError(t, err)
	u := &User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: hash,
		FullName:     "Test User",
		Status:       statusActive,
		CreatedAt:    time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	r.users[u.ID] = u
	r.byEmail[lower(email)] = u.ID
	return u
}

func (r *fakeRepo) activeSessionCount(userID uuid.UUID, now time.Time) int {
	n, _ := r.CountActiveSessions(context.Background(), userID, now)
	return n
}

type testEnv struct {
	svc    *Service
	repo   *fakeRepo
	mailer *fakeMailer
	clk    *clock
	tokens *token.Manager
	aead   *crypto.AEAD
}

// errLimiter always fails — used to test fail-open vs fail-closed behavior.
type errLimiter struct{}

func (errLimiter) Allow(context.Context, string, int, time.Duration) (bool, int, error) {
	return false, 0, errLimiterDown
}

var errLimiterDown = errorString("rate limiter down")

type errorString string

func (e errorString) Error() string { return string(e) }

func newTestEnv(t *testing.T) *testEnv { return newTestEnvWith(t, nil) }

func newTestEnvWith(t *testing.T, rl ratelimit.Limiter) *testEnv {
	t.Helper()
	repo := newFakeRepo()
	mailer := &fakeMailer{}
	clk := &clock{t: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	tm := token.NewManager("test-secret-key-please-rotate", 15*time.Minute, 5*time.Minute, clk.Now)
	aead, err := crypto.NewAEAD(bytes.Repeat([]byte{0x2a}, 32))
	require.NoError(t, err)
	if rl == nil {
		rl = ratelimit.NewMemoryLimiter(clk.Now)
	}
	svc := NewService(repo, tm, rl, mailer, aead, storage.NewLocal(""), Options{
		AccessTTL:       15 * time.Minute,
		RefreshTTL:      720 * time.Hour,
		ResetTTL:        30 * time.Minute,
		MaxFailedLogins: 5,
		LockoutBase:     time.Minute,
		SessionCap:      10,
		AppBaseURL:      "http://localhost:5173",
		Now:             clk.Now,
		Logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		Dispatch:        func(fn func()) { fn() }, // run synchronously in tests
	})
	return &testEnv{svc: svc, repo: repo, mailer: mailer, clk: clk, tokens: tm, aead: aead}
}

func assertAppErr(t *testing.T, err error, status int, key string) {
	t.Helper()
	require.Error(t, err)
	ae, ok := apperr.As(err)
	require.True(t, ok, "expected *AppError, got %T: %v", err, err)
	require.Equal(t, status, ae.Status, "status mismatch")
	require.Equal(t, key, ae.Key, "key mismatch")
}
