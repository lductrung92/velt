package account

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/ratelimit"
	"github.com/velt/backend/internal/platform/storage"
	"github.com/velt/backend/internal/platform/token"
	"github.com/velt/backend/internal/platform/totp"
)

const currentPassword = "current-password-123"

type fakeRepo struct {
	user       *User
	tf         *TwoFactor
	revokedAll bool
	newSession *Session
	avatarErr  error // injectable: makes UpdateAvatarPath fail (rollback-path test)
}

func (r *fakeRepo) GetUserByID(_ context.Context, id uuid.UUID) (*User, error) {
	if r.user == nil || r.user.ID != id {
		return nil, ErrNotFound
	}
	cp := *r.user
	return &cp, nil
}

func (r *fakeRepo) UpdateFullName(_ context.Context, _ uuid.UUID, name string) error {
	r.user.FullName = name
	return nil
}

func (r *fakeRepo) UpdateAvatarPath(_ context.Context, _ uuid.UUID, path *string) error {
	if r.avatarErr != nil {
		return r.avatarErr
	}
	r.user.AvatarPath = path
	return nil
}

func (r *fakeRepo) GetTwoFactor(_ context.Context, id uuid.UUID) (*TwoFactor, error) {
	if r.tf == nil || r.tf.UserID != id {
		return nil, ErrNotFound
	}
	cp := *r.tf
	return &cp, nil
}

func (r *fakeRepo) UpsertPendingSecret(_ context.Context, id uuid.UUID, enc []byte) error {
	r.tf = &TwoFactor{UserID: id, SecretEncrypted: append([]byte(nil), enc...)}
	return nil
}

func (r *fakeRepo) EnableTwoFactor(_ context.Context, _ uuid.UUID, codes []totp.RecoveryCode, at time.Time, lastStep int64) error {
	r.tf.EnabledAt = &at
	r.tf.RecoveryCodes = codes
	r.tf.LastUsedStep = &lastStep
	return nil
}

func (r *fakeRepo) UpdateRecoveryCodes(_ context.Context, _ uuid.UUID, codes []totp.RecoveryCode) error {
	r.tf.RecoveryCodes = codes
	return nil
}

func (r *fakeRepo) DeleteTwoFactor(_ context.Context, _ uuid.UUID) error {
	r.tf = nil
	return nil
}

func (r *fakeRepo) ApplyPasswordChange(_ context.Context, _ uuid.UUID, hash string, _ time.Time, s *Session) error {
	r.user.PasswordHash = hash
	r.revokedAll = true
	r.newSession = s
	return nil
}

type fakeSettings struct{ maxMB int }

func (f fakeSettings) GetInt(context.Context, string) int { return f.maxMB }

type errLimiter struct{}

func (errLimiter) Allow(context.Context, string, int, time.Duration) (bool, int, error) {
	return false, 0, errString("limiter down")
}

type errString string

func (e errString) Error() string { return string(e) }

type tenv struct {
	svc   *Service
	repo  *fakeRepo
	aead  *crypto.AEAD
	id    *httpx.Identity
	clk   time.Time
	store storage.Storage
}

func newTestSvc(t *testing.T) *tenv { return build(t, nil, nil) }

func newTestSvcWith(t *testing.T, rl ratelimit.Limiter) *tenv { return build(t, rl, nil) }

// newTestSvcStore builds the service with a custom storage double (avatar
// save/delete failure + rollback tests).
func newTestSvcStore(t *testing.T, store storage.Storage) *tenv { return build(t, nil, store) }

func build(t *testing.T, rl ratelimit.Limiter, store storage.Storage) *tenv {
	t.Helper()
	hash, err := crypto.HashPassword(currentPassword)
	require.NoError(t, err)
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	now := func() time.Time { return clk }

	uid := uuid.New()
	repo := &fakeRepo{user: &User{
		ID: uid, Email: "user@example.com", FullName: "Old Name",
		PasswordHash: hash, Status: "active", CreatedAt: clk,
	}}
	aead, err := crypto.NewAEAD(bytes.Repeat([]byte{0x5c}, 32))
	require.NoError(t, err)
	tm := token.NewManager("account-test-secret", 15*time.Minute, 5*time.Minute, now)
	if rl == nil {
		rl = ratelimit.NewMemoryLimiter(now)
	}
	if store == nil {
		store = storage.NewLocal(t.TempDir())
	}
	svc := NewService(repo, tm, aead, rl, store, fakeSettings{maxMB: 10}, Options{
		AccessTTL:  15 * time.Minute,
		RefreshTTL: 720 * time.Hour,
		Now:        now,
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return &tenv{svc: svc, repo: repo, aead: aead, id: &httpx.Identity{UserID: uid}, clk: clk, store: store}
}

// failingStore is a Storage double that can fail Save or Delete on demand and
// records Delete calls so avatar rollback can be asserted.
type failingStore struct {
	failSave   bool
	failDelete bool
	saved      map[string]bool
	deleted    []string
}

func newFailingStore() *failingStore { return &failingStore{saved: map[string]bool{}} }

func (s *failingStore) Save(_ context.Context, key string, r io.Reader) error {
	if s.failSave {
		return errString("save failed")
	}
	_, _ = io.Copy(io.Discard, r)
	s.saved[key] = true
	return nil
}

func (s *failingStore) Open(context.Context, string) (io.ReadCloser, error) {
	return nil, errString("not implemented")
}

func (s *failingStore) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	if s.failDelete {
		return errString("delete failed")
	}
	delete(s.saved, key)
	return nil
}

func (s *failingStore) URL(_ context.Context, key string) string { return "/api/files/" + key }

func assertAppErr(t *testing.T, err error, status int, key string) {
	t.Helper()
	require.Error(t, err)
	ae, ok := apperr.As(err)
	require.True(t, ok, "expected *AppError, got %T: %v", err, err)
	require.Equal(t, status, ae.Status)
	require.Equal(t, key, ae.Key)
}
