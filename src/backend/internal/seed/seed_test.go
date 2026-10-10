package seed

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/crypto"
	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

// testAEAD builds an AEAD from a fixed 32-byte (64 hex char) dev key.
func testAEAD(t *testing.T) *crypto.AEAD {
	t.Helper()
	key, err := crypto.ParseKey("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	require.NoError(t, err)
	a, err := crypto.NewAEAD(key)
	require.NoError(t, err)
	return a
}

func TestBuildSeedUsers(t *testing.T) {
	users := buildSeedUsers(3)
	require.Len(t, users, 6+3) // 6 fixtures + 3 bulk (super_admin is bootstrapped separately)

	// Emails are unique.
	seen := map[string]bool{}
	for _, u := range users {
		require.False(t, seen[u.email], "duplicate email %s", u.email)
		seen[u.email] = true
	}

	// Fixtures cover every status and the admin role.
	statuses := map[string]bool{}
	var hasAdmin, hasBruteLocked bool
	for _, u := range users {
		statuses[u.status] = true
		if u.roleCode == "admin" {
			hasAdmin = true
		}
		if u.bruteLocked {
			hasBruteLocked = true
		}
	}
	require.True(t, statuses["active"])
	require.True(t, statuses["disabled"])
	require.True(t, statuses["locked"])
	require.True(t, hasAdmin)
	require.True(t, hasBruteLocked)
}

func TestBuildSeedUsers_ZeroCount(t *testing.T) {
	require.Len(t, buildSeedUsers(0), 6) // fixtures only
}

// --- Integration (requires TEST_DATABASE_URL) ---

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

func requireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	return testPool
}

func cleanupSeed(t *testing.T, pool *pgxpool.Pool) {
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx,
			`DELETE FROM users WHERE email LIKE '%@' || $1 OR email = $2`, SeedDomain, SuperAdminEmail)
	})
}

func TestIT_SeedIdempotentAndRoles(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	cleanupSeed(t, pool)

	// First run with reset → creates the full set (super_admin is uncounted).
	sum, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 5, Reset: true})
	require.NoError(t, err)
	require.Equal(t, 6+5, sum.Created)
	require.Equal(t, 0, sum.Skipped)
	require.Equal(t, 6+5, sum.RolesAssigned)

	// Second run without reset → idempotent (nothing new created).
	sum2, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 5, Reset: false})
	require.NoError(t, err)
	require.Equal(t, 0, sum2.Created)
	require.Equal(t, 6+5, sum2.Skipped)
	require.Equal(t, 0, sum2.RolesAssigned, "roles already assigned → no-ops")

	// super_admin exists with the super_admin role.
	var superRole string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT r.code FROM users u
		   JOIN user_roles ur ON ur.user_id = u.id
		   JOIN roles r ON r.id = ur.role_id
		  WHERE u.email = $1`, SuperAdminEmail).Scan(&superRole))
	require.Equal(t, "super_admin", superRole)

	// editor@ has the editor role.
	var roleCode string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT r.code FROM users u
		   JOIN user_roles ur ON ur.user_id = u.id
		   JOIN roles r ON r.id = ur.role_id
		  WHERE u.email = $1`, "editor@"+SeedDomain).Scan(&roleCode))
	require.Equal(t, "editor", roleCode)

	// lockedout@ is active with a future locked_until + failed count.
	var status string
	var failed int
	var lockedUntilSet bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, failed_login_count, locked_until IS NOT NULL FROM users WHERE email = $1`,
		"lockedout@"+SeedDomain).Scan(&status, &failed, &lockedUntilSet))
	require.Equal(t, "active", status)
	require.Equal(t, 5, failed)
	require.True(t, lockedUntilSet)
}

func TestIT_SeedReset(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	cleanupSeed(t, pool)

	_, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 2, Reset: true})
	require.NoError(t, err)

	sum, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 2, Reset: true})
	require.NoError(t, err)
	require.Equal(t, 6+2, sum.Deleted, "reset removes the prior @seed.local set (super_admin survives)")
	require.Equal(t, 6+2, sum.Created)
}

func TestIT_Settings(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM system_settings WHERE key = ANY($1)`,
			[]string{"storage.driver", "storage.s3_bucket", "storage.s3_region", "storage.s3_endpoint",
				"storage.s3_access_key", "storage.s3_secret", "mail.smtp_host", "mail.smtp_port", "mail.from_address"})
	})

	aead := testAEAD(t)
	require.NoError(t, Settings(ctx, pool, aead))

	// Non-secret value is stored as JSON.
	var driver string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT value #>> '{}' FROM system_settings WHERE key = $1`, "storage.driver").Scan(&driver))
	require.Equal(t, "s3", driver)

	// Secret is encrypted (value NULL, value_encrypted set) and round-trips.
	var enc []byte
	var val *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT value_encrypted, value::text FROM system_settings WHERE key = $1`, "storage.s3_secret").Scan(&enc, &val))
	require.Nil(t, val, "secret must not be stored in the plain value column")
	require.NotEmpty(t, enc)
	plain, err := aead.Decrypt(enc)
	require.NoError(t, err)
	require.Equal(t, "change-me-dev-only-s3-secret", string(plain))
}
