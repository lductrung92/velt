package categories

import (
	"context"
	"os"
	"sync"
	"testing"

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
// (mirrors catalog/admintest/cmstest; this module has no shared test package).
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
		t.Fatalf("product categories test db: %v", dbErr)
	}
	return dbPool
}

// categoriesDB returns a repository that removes every row it wrote afterwards:
// these tests run against the developer's own database, so nothing they insert
// may outlive them.
func categoriesDB(t *testing.T) (Repository, *pgxpool.Pool) {
	t.Helper()
	pool := requireDB(t)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM product_categories WHERE slug LIKE 'pcatit-%'`)
	})
	return NewRepository(pool), pool
}

func itSlug() string { return "pcatit-" + uuid.NewString()[:8] }

// A row written the way every row predating the status column was written — no
// status at all — must come back published, not draft.
func TestIT_StatusDefaultsToPublishedForExistingRows(t *testing.T) {
	repo, pool := categoriesDB(t)
	ctx := context.Background()

	slug := itSlug()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO product_categories (slug, name, sort_order) VALUES ($1, 'PCat IT', 0) RETURNING id`,
		slug).Scan(&id))

	got, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, StatusPublished, got.Status)
}

func TestIT_StatusRoundTripsAndFiltersTheList(t *testing.T) {
	repo, _ := categoriesDB(t)
	ctx := context.Background()

	live, err := repo.Create(ctx, write{Slug: itSlug(), Name: "PCat IT live", Status: StatusPublished})
	require.NoError(t, err)
	draft, err := repo.Create(ctx, write{Slug: itSlug(), Name: "PCat IT draft", Status: StatusDraft})
	require.NoError(t, err)
	require.Equal(t, StatusDraft, draft.Status)

	drafts, err := repo.List(ctx, StatusDraft)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{draft.ID}, idsOf(drafts, live.ID, draft.ID))

	published, err := repo.List(ctx, StatusPublished)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{live.ID}, idsOf(published, live.ID, draft.ID))

	all, err := repo.List(ctx, "")
	require.NoError(t, err)
	require.Len(t, idsOf(all, live.ID, draft.ID), 2)

	// An update carries the new status through the full-row UPDATE.
	archived, err := repo.Update(ctx, draft.ID,
		write{Slug: draft.Slug, Name: draft.Name, Status: StatusArchived, SortOrder: &draft.SortOrder})
	require.NoError(t, err)
	require.Equal(t, StatusArchived, archived.Status)
}

// The CHECK constraint is the last line of defence behind the request
// validation: a value the API would have rejected cannot reach the table.
func TestIT_UnknownStatusIsRejectedByTheConstraint(t *testing.T) {
	repo, _ := categoriesDB(t)
	_, err := repo.Create(context.Background(), write{Slug: itSlug(), Name: "PCat IT bad", Status: "retired"})
	require.Error(t, err)
}

// idsOf keeps only the ids this test created — the developer's database has
// categories of its own and the list is not scoped to a prefix.
func idsOf(rows []Category, mine ...uuid.UUID) []uuid.UUID {
	want := make(map[uuid.UUID]bool, len(mine))
	for _, id := range mine {
		want[id] = true
	}
	out := []uuid.UUID{}
	for _, c := range rows {
		if want[c.ID] {
			out = append(out, c.ID)
		}
	}
	return out
}
