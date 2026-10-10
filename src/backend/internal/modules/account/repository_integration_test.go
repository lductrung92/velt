package account

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
	"github.com/velt/backend/internal/platform/totp"
	"github.com/velt/backend/migrations"
)

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
	hash, err := crypto.HashPassword(currentPassword)
	require.NoError(t, err)
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,'IT User') RETURNING id`,
		"acct-it-"+uuid.NewString()+"@x.test", hash).Scan(&id))
	return id
}

func TestIT_ProfileUpdates(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	require.NoError(t, repo.UpdateFullName(ctx, id, "Renamed User"))
	path := "users/" + id.String() + "/avatar-abc.png"
	require.NoError(t, repo.UpdateAvatarPath(ctx, id, &path))

	u, err := repo.GetUserByID(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "Renamed User", u.FullName)
	require.NotNil(t, u.AvatarPath)
	require.Equal(t, path, *u.AvatarPath)

	require.NoError(t, repo.UpdateAvatarPath(ctx, id, nil))
	u, _ = repo.GetUserByID(ctx, id)
	require.Nil(t, u.AvatarPath)
}

func TestIT_TwoFactorLifecycle(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)

	_, err := repo.GetTwoFactor(ctx, id)
	require.ErrorIs(t, err, ErrNotFound)

	require.NoError(t, repo.UpsertPendingSecret(ctx, id, []byte{0x01, 0x02, 0x03}))
	tf, err := repo.GetTwoFactor(ctx, id)
	require.NoError(t, err)
	require.False(t, tf.Enabled())
	require.Equal(t, []byte{0x01, 0x02, 0x03}, tf.SecretEncrypted)

	_, codes, err := totp.GenerateRecoveryCodes(10)
	require.NoError(t, err)
	require.NoError(t, repo.EnableTwoFactor(ctx, id, codes, time.Now(), 999))
	tf, _ = repo.GetTwoFactor(ctx, id)
	require.True(t, tf.Enabled())
	require.Len(t, tf.RecoveryCodes, 10)
	require.Equal(t, int64(999), *tf.LastUsedStep)

	// Regenerate (replace) recovery codes.
	_, codes2, _ := totp.GenerateRecoveryCodes(10)
	require.NoError(t, repo.UpdateRecoveryCodes(ctx, id, codes2))
	tf, _ = repo.GetTwoFactor(ctx, id)
	require.NotEqual(t, codes[0].Hash, tf.RecoveryCodes[0].Hash)

	require.NoError(t, repo.DeleteTwoFactor(ctx, id))
	_, err = repo.GetTwoFactor(ctx, id)
	require.ErrorIs(t, err, ErrNotFound)
}

func TestIT_ApplyPasswordChange(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	id := mkUser(t, pool)
	now := time.Now()

	// Pre-existing session that must be revoked.
	_, err := pool.Exec(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
		 VALUES ($1, $2, $3)`, id, crypto.HashToken(uuid.NewString()), now.Add(time.Hour))
	require.NoError(t, err)

	newHash, _ := crypto.HashPassword("a-fresh-password")
	newSess := &Session{
		ID: uuid.New(), UserID: id, RefreshTokenHash: crypto.HashToken(uuid.NewString()),
		CreatedAt: now, ExpiresAt: now.Add(720 * time.Hour),
	}
	require.NoError(t, repo.ApplyPasswordChange(ctx, id, newHash, now, newSess))

	// Password updated.
	u, _ := repo.GetUserByID(ctx, id)
	ok, _ := crypto.VerifyPassword("a-fresh-password", u.PasswordHash)
	require.True(t, ok)

	// Exactly one active session remains (the new one).
	var active int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL`, id).Scan(&active))
	require.Equal(t, 1, active)
}
