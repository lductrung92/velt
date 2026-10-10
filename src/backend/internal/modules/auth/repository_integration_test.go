package auth

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

// testPool is the integration DB pool, set up in TestMain when TEST_DATABASE_URL
// is configured. Integration tests skip otherwise so the unit suite stays
// runnable without a database.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	if url := os.Getenv("TEST_DATABASE_URL"); url != "" {
		if err := db.Migrate(url, migrations.FS); err != nil {
			panic("migrate test db: " + err.Error())
		}
		pool, err := pgxpool.New(context.Background(), url)
		if err != nil {
			panic("connect test db: " + err.Error())
		}
		testPool = pool
		code := m.Run()
		pool.Close()
		os.Exit(code)
	}
	os.Exit(m.Run())
}

func requireDB(t *testing.T) (Repository, *pgxpool.Pool) {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	return NewRepository(testPool), testPool
}

func mkUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	hash, err := crypto.HashPassword("integration-password")
	require.NoError(t, err)
	var id uuid.UUID
	err = pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, 'IT User') RETURNING id`,
		"it-"+uuid.NewString()+"@example.com", hash).Scan(&id)
	require.NoError(t, err)
	return id
}

func TestIT_UserLifecycle(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	u, err := repo.GetUserByID(ctx, id)
	require.NoError(t, err)
	require.Equal(t, statusActive, u.Status)
	require.Zero(t, u.FailedLoginCount)

	byEmail, err := repo.GetUserByEmail(ctx, u.Email)
	require.NoError(t, err)
	require.Equal(t, id, byEmail.ID)

	_, err = repo.GetUserByEmail(ctx, "missing-"+uuid.NewString()+"@x.com")
	require.ErrorIs(t, err, ErrNotFound)
}

func TestIT_FailedLoginAndLockThenSuccess(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	// Increment without lock keeps locked_until null (COALESCE).
	require.NoError(t, repo.IncrementFailedLogin(ctx, id, nil))
	u, _ := repo.GetUserByID(ctx, id)
	require.Equal(t, 1, u.FailedLoginCount)
	require.Nil(t, u.LockedUntil)

	// Increment with a lock sets it.
	lock := time.Now().Add(5 * time.Minute)
	require.NoError(t, repo.IncrementFailedLogin(ctx, id, &lock))
	u, _ = repo.GetUserByID(ctx, id)
	require.Equal(t, 2, u.FailedLoginCount)
	require.NotNil(t, u.LockedUntil)

	// Success resets everything.
	require.NoError(t, repo.MarkLoginSuccess(ctx, id, time.Now()))
	u, _ = repo.GetUserByID(ctx, id)
	require.Zero(t, u.FailedLoginCount)
	require.Nil(t, u.LockedUntil)
	require.NotNil(t, u.LastLoginAt)
}

func TestIT_RolesAndPermissions(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	// Assign the seeded admin role.
	_, err := pool.Exec(ctx,
		`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'admin'`, id)
	require.NoError(t, err)

	roles, perms, err := repo.GetRolesAndPermissions(ctx, id)
	require.NoError(t, err)
	require.Equal(t, []string{"admin"}, roles)
	require.Contains(t, perms, "users.read")
	require.NotContains(t, perms, "settings.read", "settings is super_admin-only (0004)")
	require.NotContains(t, perms, "settings.manage", "settings is super_admin-only (0004)")
	require.NotContains(t, perms, "*", "admin must not hold wildcard")
	require.NotContains(t, perms, "impersonation.start")
}

func TestIT_SessionRotationAndReuseQueryPath(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)
	now := time.Now()

	raw1 := uuid.NewString()
	s1 := &Session{ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(raw1),
		CreatedAt: now, ExpiresAt: now.Add(time.Hour)}
	require.NoError(t, repo.CreateSession(ctx, s1))

	n, err := repo.CountActiveSessions(ctx, id, now)
	require.NoError(t, err)
	require.Equal(t, 1, n)

	got, err := repo.GetSessionByRefreshHash(ctx, crypto.HashToken(raw1))
	require.NoError(t, err)
	require.Equal(t, s1.ID, got.ID)
	require.Nil(t, got.RevokedAt)

	// Rotate → old revoked, new active.
	raw2 := uuid.NewString()
	s2 := &Session{ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(raw2),
		CreatedAt: now, ExpiresAt: now.Add(time.Hour)}
	require.NoError(t, repo.RotateSession(ctx, s1.ID, s2, now))

	old, _ := repo.GetSessionByRefreshHash(ctx, crypto.HashToken(raw1))
	require.NotNil(t, old.RevokedAt, "rotated session must be revoked")

	// Revoke all.
	require.NoError(t, repo.RevokeAllUserSessions(ctx, id, now))
	n, _ = repo.CountActiveSessions(ctx, id, now)
	require.Zero(t, n)
}

func TestIT_SessionCapOldestEviction(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)
	base := time.Now()

	oldest := &Session{ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(uuid.NewString()),
		CreatedAt: base.Add(-2 * time.Hour), ExpiresAt: base.Add(time.Hour)}
	newer := &Session{ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(uuid.NewString()),
		CreatedAt: base.Add(-1 * time.Hour), ExpiresAt: base.Add(time.Hour)}
	require.NoError(t, repo.CreateSession(ctx, oldest))
	require.NoError(t, repo.CreateSession(ctx, newer))

	require.NoError(t, repo.RevokeOldestActiveSession(ctx, id, base))
	o, _ := repo.GetSessionByRefreshHash(ctx, oldest.RefreshTokenHash)
	require.NotNil(t, o.RevokedAt)
	nw, _ := repo.GetSessionByRefreshHash(ctx, newer.RefreshTokenHash)
	require.Nil(t, nw.RevokedAt)
}

func TestIT_TwoFactorRoundTrip(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	_, err := repo.GetTwoFactor(ctx, id)
	require.ErrorIs(t, err, ErrNotFound)

	_, err = pool.Exec(ctx,
		`INSERT INTO two_factor_secrets (user_id, secret_encrypted, recovery_codes, enabled_at)
		 VALUES ($1, $2, $3, now())`, id, []byte{0x01, 0x02}, `[{"hash":"abc","used":false}]`)
	require.NoError(t, err)

	tf, err := repo.GetTwoFactor(ctx, id)
	require.NoError(t, err)
	require.True(t, tf.Enabled())
	require.Len(t, tf.RecoveryCodes, 1)
	require.Equal(t, "abc", tf.RecoveryCodes[0].Hash)

	step := int64(123)
	before := make([]RecoveryCode, len(tf.RecoveryCodes))
	copy(before, tf.RecoveryCodes) // pre-mutation snapshot for the CAS
	tf.RecoveryCodes[0].Used = true
	applied, err := repo.UpdateTwoFactorUsage(ctx, id, &step, tf.RecoveryCodes, tf.LastUsedStep, before)
	require.NoError(t, err)
	require.True(t, applied)
	tf2, _ := repo.GetTwoFactor(ctx, id)
	require.Equal(t, step, *tf2.LastUsedStep)
	require.True(t, tf2.RecoveryCodes[0].Used)
}

func TestIT_ResetPasswordTransaction(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)
	now := time.Now()

	// An active session that must be revoked by the reset.
	sess := &Session{ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(uuid.NewString()),
		CreatedAt: now, ExpiresAt: now.Add(time.Hour)}
	require.NoError(t, repo.CreateSession(ctx, sess))

	raw := uuid.NewString()
	tok := &ResetToken{ID: uuid.New(), UserID: id, TokenHash: crypto.HashToken(raw),
		ExpiresAt: now.Add(30 * time.Minute), CreatedAt: now}
	require.NoError(t, repo.CreateResetToken(ctx, tok))

	got, err := repo.GetResetTokenByHash(ctx, crypto.HashToken(raw))
	require.NoError(t, err)
	require.Nil(t, got.UsedAt)

	newHash, _ := crypto.HashPassword("a-fresh-password")
	require.NoError(t, repo.ResetPassword(ctx, id, newHash, tok.ID, now))

	// Password changed, token consumed, sessions revoked.
	u, _ := repo.GetUserByID(ctx, id)
	ok, _ := crypto.VerifyPassword("a-fresh-password", u.PasswordHash)
	require.True(t, ok)
	used, _ := repo.GetResetTokenByHash(ctx, crypto.HashToken(raw))
	require.NotNil(t, used.UsedAt)
	n, _ := repo.CountActiveSessions(ctx, id, now)
	require.Zero(t, n)
}

func TestIT_InvalidateUserResetTokens(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)
	now := time.Now()

	raw := uuid.NewString()
	require.NoError(t, repo.CreateResetToken(ctx, &ResetToken{ID: uuid.New(), UserID: id,
		TokenHash: crypto.HashToken(raw), ExpiresAt: now.Add(time.Hour), CreatedAt: now}))
	require.NoError(t, repo.InvalidateUserResetTokens(ctx, id, now))

	tok, err := repo.GetResetTokenByHash(ctx, crypto.HashToken(raw))
	require.NoError(t, err)
	require.NotNil(t, tok.UsedAt, "prior token must be invalidated")
}
