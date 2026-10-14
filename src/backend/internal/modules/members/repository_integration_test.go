package members

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

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
		t.Fatalf("members test db: %v", dbErr)
	}
	return dbPool
}

// vn is the Vietnam offset the console works in; the created_at fixtures below
// are written as the wall-clock times an editor in Hanoi would have seen.
var vn = time.FixedZone("+07", 7*60*60)

// membersDB returns a repository plus a helper that inserts a member stamped at
// an exact created_at, and removes every row it wrote afterwards.
func membersDB(t *testing.T) (Repository, func(slug string, createdAt time.Time)) {
	t.Helper()
	pool := requireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM members WHERE slug LIKE 'memit-%'`)
	})
	seed := func(slug string, createdAt time.Time) {
		t.Helper()
		_, err := pool.Exec(ctx,
			`INSERT INTO members (slug, full_name, created_at) VALUES ($1, $2, $3)`,
			slug, slug, createdAt)
		require.NoError(t, err)
	}
	return NewRepository(pool), seed
}

func dayVN(t *testing.T, day string) *time.Time {
	t.Helper()
	d, err := time.ParseInLocation("2006-01-02", day, vn)
	require.NoError(t, err)
	return &d
}

// endOfDayVN is the exclusive upper bound httpx.QueryDateRange produces for
// created_to=day: midnight at the start of the following day.
func endOfDayVN(t *testing.T, day string) *time.Time {
	t.Helper()
	end := dayVN(t, day).AddDate(0, 0, 1)
	return &end
}

func listSlugs(t *testing.T, repo Repository, p ListParams) ([]string, int) {
	t.Helper()
	p.Page, p.PageSize = 1, 100
	// The target DB may hold rows this file did not write; the prefix search
	// narrows both the rows AND the total to this test's fixtures.
	p.Query = "memit-"
	rows, total, err := repo.List(context.Background(), p)
	require.NoError(t, err)
	out := []string{}
	for _, r := range rows {
		out = append(out, r.Slug)
	}
	return out, total
}

func TestIT_MemberCreatedRangeIncludesAndExcludes(t *testing.T) {
	repo, seed := membersDB(t)
	seed("memit-before", time.Date(2026, 10, 9, 23, 59, 59, 0, vn))
	seed("memit-inside", time.Date(2026, 10, 11, 9, 0, 0, 0, vn))
	seed("memit-after", time.Date(2026, 10, 14, 0, 0, 0, 0, vn))

	slugs, total := listSlugs(t, repo, ListParams{
		CreatedFrom: dayVN(t, "2026-10-10"),
		CreatedTo:   endOfDayVN(t, "2026-10-13"),
	})
	require.Equal(t, []string{"memit-inside"}, slugs)
	// The count the dashboard reads must agree with the rows under it.
	require.Equal(t, 1, total)
}

// The last second of created_to is inside the range: "to 13 Oct" means through
// the end of 13 Oct, Vietnam time.
func TestIT_MemberCreatedToIsInclusiveOfTheWholeDay(t *testing.T) {
	repo, seed := membersDB(t)
	seed("memit-lastsecond", time.Date(2026, 10, 13, 23, 59, 59, 0, vn))
	seed("memit-nextmidnight", time.Date(2026, 10, 14, 0, 0, 0, 0, vn))

	slugs, total := listSlugs(t, repo, ListParams{
		CreatedFrom: dayVN(t, "2026-10-13"),
		CreatedTo:   endOfDayVN(t, "2026-10-13"),
	})
	require.Equal(t, []string{"memit-lastsecond"}, slugs)
	require.Equal(t, 1, total)
}
