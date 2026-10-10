package settings

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
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

func mkActor(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	hash, err := crypto.HashPassword("integration-password")
	require.NoError(t, err)
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,'Actor') RETURNING id`,
		"settings-it-"+uuid.NewString()+"@x.test", hash).Scan(&id))
	return id
}

func TestIT_ApplyLoadDelete(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	actor := mkActor(t, pool)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM system_settings WHERE key LIKE 'app.%' OR key LIKE 'mail.%'`)
	})

	// Set a plaintext value and an encrypted secret in one transaction.
	require.NoError(t, repo.Apply(ctx, []writeOp{
		{Key: "app.name", Kind: opSetValue, Value: json.RawMessage(`"IT App"`)},
		{Key: "mail.smtp_password", Kind: opSetEncrypted, Encrypted: []byte{0xaa, 0xbb}},
	}, actor))

	snap, err := repo.LoadAll(ctx)
	require.NoError(t, err)
	require.JSONEq(t, `"IT App"`, string(snap["app.name"].Value))
	require.Equal(t, []byte{0xaa, 0xbb}, snap["mail.smtp_password"].Encrypted)

	// ON CONFLICT update: switching a key from value→encrypted clears value.
	require.NoError(t, repo.Apply(ctx, []writeOp{
		{Key: "app.name", Kind: opSetValue, Value: json.RawMessage(`"Renamed"`)},
	}, actor))
	snap, _ = repo.LoadAll(ctx)
	require.JSONEq(t, `"Renamed"`, string(snap["app.name"].Value))

	// Delete reverts to "no row".
	require.NoError(t, repo.Apply(ctx, []writeOp{{Key: "app.name", Kind: opDelete}}, actor))
	snap, _ = repo.LoadAll(ctx)
	_, ok := snap["app.name"]
	require.False(t, ok)
}

func TestIT_ValueEncryptedAreMutuallyExclusive(t *testing.T) {
	repo, pool := requireDB(t)
	ctx := context.Background()
	actor := mkActor(t, pool)
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM system_settings WHERE key = 'mail.smtp_user'`) })

	// Set value, then encrypted on the same key → value must become NULL (CHECK holds).
	require.NoError(t, repo.Apply(ctx, []writeOp{{Key: "mail.smtp_user", Kind: opSetValue, Value: json.RawMessage(`"u"`)}}, actor))
	require.NoError(t, repo.Apply(ctx, []writeOp{{Key: "mail.smtp_user", Kind: opSetEncrypted, Encrypted: []byte{0x01}}}, actor))
	snap, _ := repo.LoadAll(ctx)
	require.Nil(t, snap["mail.smtp_user"].Value)
	require.Equal(t, []byte{0x01}, snap["mail.smtp_user"].Encrypted)
}
