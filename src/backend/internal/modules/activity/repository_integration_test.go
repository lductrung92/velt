package activity

import (
	"context"
	"os"
	"strings"
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

// itPrefix marks every row this file writes, so cleanup removes exactly those
// and nothing a real recorder put there.
const itPrefix = "activityit."

// requireDB returns a migrated test pool. Skips when TEST_DATABASE_URL is unset
// (mirrors admintest/cmstest; this module has no shared package of its own).
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
		t.Fatalf("activity test db: %v", dbErr)
	}
	return dbPool
}

// fixture is one seeded run. The log is append-only and shared with whatever
// the recorders have already written, so every seeded action, actor label and
// entity label carries a per-run token: a filter that mentions it can only
// match this run's rows.
type fixture struct {
	repo    Repository
	token   string
	actor   uuid.UUID
	article uuid.UUID
	now     time.Time
}

// all is the baseline filter: everything this run seeded, and nothing else.
func (f fixture) all() ListParams {
	return ListParams{Query: f.token, Page: 1, PageSize: 100}
}

func (f fixture) action(verb string) string { return itPrefix + f.token + "." + verb }

func seed(t *testing.T) fixture {
	t.Helper()
	pool := requireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM activity_log WHERE action LIKE $1`, itPrefix+"%")
	})

	f := fixture{
		token:   strings.ReplaceAll(uuid.NewString(), "-", "")[:12],
		actor:   uuid.New(),
		article: uuid.New(),
		now:     time.Now().UTC().Truncate(time.Second),
	}
	other := uuid.New()
	alice, bob := "Alice "+f.token, "Bob "+f.token
	launch, draft := "Ra mat VELT "+f.token, "Bai khac "+f.token

	rows := []struct {
		action  string
		entity  any
		id      any
		label   any
		actorID any
		actorNm string
		age     time.Duration
	}{
		{f.action("article.publish"), "article", f.article, launch, f.actor, alice, 0},
		{f.action("article.update"), "article", f.article, launch, f.actor, alice, time.Hour},
		{f.action("auth.login"), nil, nil, nil, f.actor, alice, 2 * time.Hour},
		{f.action("auth.login"), nil, nil, nil, other, bob, 3 * time.Hour},
		{f.action("article.publish"), "article", uuid.New(), draft, other, bob, 100 * 24 * time.Hour},
	}
	for _, r := range rows {
		_, err := pool.Exec(ctx,
			`INSERT INTO activity_log (occurred_at, action, entity, entity_id, entity_label,
			                           actor_id, actor_label)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			f.now.Add(-r.age), r.action, r.entity, r.id, r.label, r.actorID, r.actorNm)
		require.NoError(t, err)
	}
	f.repo = NewRepository(pool)
	return f
}

func TestIT_ActivityFiltersRideTheIndexes(t *testing.T) {
	f := seed(t)
	ctx := context.Background()

	// Newest first, and the labels come back without a join — the point of the
	// snapshot columns.
	rows, total, err := f.repo.List(ctx, f.all())
	require.NoError(t, err)
	require.Equal(t, 5, total)
	require.Equal(t, f.action("article.publish"), rows[0].Action)
	require.Equal(t, "Alice "+f.token, rows[0].ActorLabel)
	require.Equal(t, "Ra mat VELT "+f.token, *rows[0].EntityLabel)
	require.JSONEq(t, `{}`, string(rows[0].Metadata))

	p := f.all()
	p.ActorID = &f.actor
	_, total, err = f.repo.List(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 3, total)

	p = f.all()
	p.Action = f.action("auth.login")
	_, total, err = f.repo.List(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 2, total)

	p = f.all()
	p.Entity, p.EntityID = "article", &f.article
	_, total, err = f.repo.List(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 2, total)

	p = f.all()
	p.From, p.To = f.now.Add(-90*time.Minute), f.now
	_, total, err = f.repo.List(ctx, p)
	require.NoError(t, err)
	require.Equal(t, 2, total)
}

func TestIT_ActivityFreeTextMatchesTheSnapshottedLabels(t *testing.T) {
	f := seed(t)
	ctx := context.Background()

	for _, tc := range []struct {
		q    string
		want int
	}{
		{"alice " + f.token, 3},       // actor_label, case-insensitive
		{"ra mat velt " + f.token, 2}, // entity_label
		{f.token + ".auth.login", 2},  // the action code itself
		{"nguoi la " + f.token, 0},    // no match is an empty page, not an error
	} {
		p := f.all()
		p.Query = tc.q
		_, total, err := f.repo.List(ctx, p)
		require.NoError(t, err)
		require.Equal(t, tc.want, total, tc.q)
	}
}

func TestIT_ActivityPaginatesWithoutDroppingOrRepeating(t *testing.T) {
	f := seed(t)
	ctx := context.Background()

	seen := map[int64]bool{}
	for page := 1; page <= 3; page++ {
		p := f.all()
		p.Page, p.PageSize = page, 2
		rows, total, err := f.repo.List(ctx, p)
		require.NoError(t, err)
		require.Equal(t, 5, total, "the total is of the whole match, not the page")
		for _, r := range rows {
			require.False(t, seen[r.ID], "row %d returned twice", r.ID)
			seen[r.ID] = true
		}
	}
	require.Len(t, seen, 5)

	p := f.all()
	p.Page, p.PageSize = 99, 2
	rows, _, err := f.repo.List(ctx, p)
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestIT_ActivityActionsAreTheCodesActuallyPresent(t *testing.T) {
	f := seed(t)

	codes, err := f.repo.Actions(context.Background())
	require.NoError(t, err)
	require.Subset(t, codes, []string{
		f.action("article.publish"), f.action("article.update"), f.action("auth.login"),
	})
	// The loose index scan must return each code once and in order.
	seen := map[string]bool{}
	for i, c := range codes {
		require.False(t, seen[c], c)
		seen[c] = true
		if i > 0 {
			require.Less(t, codes[i-1], c)
		}
	}
}
