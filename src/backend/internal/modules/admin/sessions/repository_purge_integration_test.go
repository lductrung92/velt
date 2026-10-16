package sessions

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/admin/shared/admintest"
	"github.com/velt/backend/internal/platform/crypto"
)

// PurgeSessions is the one statement here that removes rows, so it is the one
// that must never be tried out against a live table: TEST_DATABASE_URL normally
// points at a working database whose auth_sessions rows are somebody's open
// logins. Every case below runs inside a transaction that is ALWAYS rolled
// back — the repository takes a querier for exactly that reason, so the code
// under test is the production statement and nothing survives the test.
func withRollbackRepo(t *testing.T, fn func(ctx context.Context, tx querier, repo Repository)) {
	t.Helper()
	pool := admintest.RequireDB(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(ctx) })
	fn(ctx, tx, &pgxRepository{pool: tx})
}

func seedUser(t *testing.T, ctx context.Context, tx querier) uuid.UUID {
	t.Helper()
	var uid uuid.UUID
	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'IT') RETURNING id`,
		"purgeit-"+uuid.NewString()+"@x.test").Scan(&uid))
	return uid
}

func seedSessionAged(t *testing.T, ctx context.Context, tx querier, uid uuid.UUID, age time.Duration) uuid.UUID {
	t.Helper()
	var sid uuid.UUID
	require.NoError(t, tx.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, created_at, expires_at)
		 VALUES ($1, $2, now() - $3::interval, now() + interval '1 hour') RETURNING id`,
		uid, crypto.HashToken(uuid.NewString()), age.String()).Scan(&sid))
	return sid
}

func sessionExists(t *testing.T, ctx context.Context, tx querier, sid uuid.UUID) bool {
	t.Helper()
	var ok bool
	require.NoError(t, tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM auth_sessions WHERE id = $1)`, sid).Scan(&ok))
	return ok
}

// The contract of "3 ngày trước": the two-day-old session survives, the
// four-day-old one does not — and the caller's own survives either way.
func TestIT_SessionPurgeKeepsTheWindowAndTheCaller(t *testing.T) {
	withRollbackRepo(t, func(ctx context.Context, tx querier, repo Repository) {
		owner := seedUser(t, ctx, tx)
		caller := seedUser(t, ctx, tx)
		young := seedSessionAged(t, ctx, tx, owner, 2*24*time.Hour)
		old := seedSessionAged(t, ctx, tx, owner, 4*24*time.Hour)
		mine := seedSessionAged(t, ctx, tx, caller, 400*24*time.Hour)

		deleted, err := repo.PurgeSessions(ctx, time.Now().UTC().Add(-3*24*time.Hour), caller)
		require.NoError(t, err)
		require.GreaterOrEqual(t, deleted, int64(1))

		require.True(t, sessionExists(t, ctx, tx, young), "a 2-day-old session must be kept")
		require.False(t, sessionExists(t, ctx, tx, old), "a 4-day-old session must be deleted")
		require.True(t, sessionExists(t, ctx, tx, mine), "the caller must not be signed out")
	})
}

// A zero cutoff is "Tất cả" — everything but the caller's own.
func TestIT_SessionPurgeAllSparesOnlyTheCaller(t *testing.T) {
	withRollbackRepo(t, func(ctx context.Context, tx querier, repo Repository) {
		owner := seedUser(t, ctx, tx)
		caller := seedUser(t, ctx, tx)
		fresh := seedSessionAged(t, ctx, tx, owner, time.Minute)
		mine := seedSessionAged(t, ctx, tx, caller, time.Minute)

		_, err := repo.PurgeSessions(ctx, time.Time{}, caller)
		require.NoError(t, err)

		require.False(t, sessionExists(t, ctx, tx, fresh))
		require.True(t, sessionExists(t, ctx, tx, mine))

		var n int
		require.NoError(t, tx.QueryRow(ctx,
			`SELECT count(*) FROM auth_sessions WHERE user_id <> $1`, caller).Scan(&n))
		require.Zero(t, n, "all means all but the caller")
	})
}
