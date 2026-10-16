package notify

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

var (
	dbOnce sync.Once
	dbPool *pgxpool.Pool
	dbErr  error
)

// requireDB returns a migrated test pool. Skips when TEST_DATABASE_URL is unset
// (mirrors the other repository integration tests).
func requireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	dbOnce.Do(func() {
		if dbErr = db.Migrate(url, migrations.FS); dbErr != nil {
			return
		}
		dbPool, dbErr = pgxpool.New(context.Background(), url)
	})
	if dbErr != nil {
		t.Fatalf("notify test db: %v", dbErr)
	}
	return dbPool
}

// seedConversation makes a conversation to claim against, and removes it after.
func seedConversation(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO ai_conversations (id, visitor_key, state) VALUES ($1, $2, 'waiting')`,
		id, "notifyit-"+uuid.NewString()[:8])
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM ai_conversations WHERE id = $1`, id)
	})
	return id
}

func TestClaimNotifyRingsOncePerWindow(t *testing.T) {
	// The guard against a visitor typing five lines and setting off five
	// notifications. The decision and the record are one statement, so a
	// second caller — including one on another instance — is told no.
	pool := requireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	convID := seedConversation(t, pool)

	first, err := repo.ClaimNotify(ctx, convID, time.Hour)
	require.NoError(t, err)
	require.True(t, first)

	second, err := repo.ClaimNotify(ctx, convID, time.Hour)
	require.NoError(t, err)
	require.False(t, second, "the same conversation must not ring twice inside the window")

	// Once the window has passed it may ring again: a visitor still waiting an
	// hour later is a new event, not a repeat.
	_, err = pool.Exec(ctx,
		`UPDATE ai_conversations SET last_notified_at = now() - interval '2 hours' WHERE id = $1`,
		convID)
	require.NoError(t, err)

	third, err := repo.ClaimNotify(ctx, convID, time.Hour)
	require.NoError(t, err)
	require.True(t, third)
}

func TestClaimNotifyIsQuietAboutAMissingConversation(t *testing.T) {
	// A conversation deleted between the message and the notification is not
	// an error to report; there is simply nobody to tell about.
	pool := requireDB(t)
	ok, err := NewRepository(pool).ClaimNotify(context.Background(), uuid.New(), time.Hour)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestEnsureKeysKeepsTheFirstPair(t *testing.T) {
	// Two instances starting at once must end up with the same VAPID identity.
	// Overwriting would silently invalidate every browser already subscribed,
	// so the loser has to be handed the winner's pair rather than its own.
	pool := requireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM push_keys`) })
	_, err := pool.Exec(ctx, `DELETE FROM push_keys`)
	require.NoError(t, err)

	pub1, priv1, err := repo.EnsureKeys(ctx, "first-public", []byte("first-private"))
	require.NoError(t, err)
	require.Equal(t, "first-public", pub1)

	pub2, priv2, err := repo.EnsureKeys(ctx, "second-public", []byte("second-private"))
	require.NoError(t, err)
	require.Equal(t, pub1, pub2, "the second caller must get the stored pair, not its own")
	require.Equal(t, priv1, priv2)

	gotPub, gotPriv, err := repo.Keys(ctx)
	require.NoError(t, err)
	require.Equal(t, "first-public", gotPub)
	require.Equal(t, []byte("first-private"), gotPriv)
}

func TestKeysIsEmptyBeforeAnyPairExists(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `DELETE FROM push_keys`)
	require.NoError(t, err)

	pub, priv, err := NewRepository(pool).Keys(ctx)
	require.NoError(t, err)
	require.Empty(t, pub)
	require.Nil(t, priv)
}
