package activity

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// The purge is the one statement in this package that removes rows, so it is
// the one that must never be tried out against a live table: TEST_DATABASE_URL
// normally points at a working database with real history in it.
//
// Every case below therefore runs inside a transaction that is ALWAYS rolled
// back. The repository takes a querier for exactly this reason, so the code
// under test is the production statement and nothing survives the test.
func withRollback(t *testing.T, fn func(ctx context.Context, repo Repository)) {
	t.Helper()
	pool := requireDB(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(ctx) })
	fn(ctx, &pgxRepository{pool: tx})
}

// seedAged writes one row aged `age` behind now and returns its action code.
func seedAged(t *testing.T, ctx context.Context, repo Repository, token string, age time.Duration) string {
	t.Helper()
	r, ok := repo.(*pgxRepository)
	require.True(t, ok)
	action := itPrefix + token
	_, err := r.pool.Exec(ctx,
		`INSERT INTO activity_log (occurred_at, action, actor_id, actor_label)
		 VALUES (now() - $1::interval, $2, $3, 'purge-it')`,
		age.String(), action, uuid.New())
	require.NoError(t, err)
	return action
}

func countAction(t *testing.T, ctx context.Context, repo Repository, action string) int {
	t.Helper()
	r := repo.(*pgxRepository)
	var n int
	require.NoError(t, r.pool.QueryRow(ctx,
		`SELECT count(*) FROM activity_log WHERE action = $1`, action).Scan(&n))
	return n
}

// The contract of "3 ngày trước": the two-day-old row survives, the four-day-old
// one does not.
func TestIT_ActivityPurgeKeepsTheWindow(t *testing.T) {
	withRollback(t, func(ctx context.Context, repo Repository) {
		token := uuid.NewString()
		young := seedAged(t, ctx, repo, token+".young", 2*24*time.Hour)
		old := seedAged(t, ctx, repo, token+".old", 4*24*time.Hour)

		deleted, err := repo.Purge(ctx, time.Now().UTC().Add(-3*24*time.Hour))
		require.NoError(t, err)
		require.GreaterOrEqual(t, deleted, int64(1))

		require.Equal(t, 1, countAction(t, ctx, repo, young), "a 2-day-old row must be kept")
		require.Equal(t, 0, countAction(t, ctx, repo, old), "a 4-day-old row must be deleted")
	})
}

// A zero cutoff is "Tất cả": no lower bound at all.
func TestIT_ActivityPurgeAllEmptiesTheTable(t *testing.T) {
	withRollback(t, func(ctx context.Context, repo Repository) {
		token := uuid.NewString()
		young := seedAged(t, ctx, repo, token+".young", time.Minute)

		_, err := repo.Purge(ctx, time.Time{})
		require.NoError(t, err)

		require.Equal(t, 0, countAction(t, ctx, repo, young))
		r := repo.(*pgxRepository)
		var n int
		require.NoError(t, r.pool.QueryRow(ctx, `SELECT count(*) FROM activity_log`).Scan(&n))
		require.Zero(t, n, "all means all")
	})
}
