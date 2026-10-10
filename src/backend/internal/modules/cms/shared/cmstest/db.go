package cmstest

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/platform/db"
	"github.com/velt/backend/migrations"
)

var (
	dbOnce sync.Once
	dbPool *pgxpool.Pool
	dbErr  error
)

// RequireDB returns a migrated test pool, lazily connecting once per test
// binary. It skips the test when TEST_DATABASE_URL is unset. Each integration
// test is responsible for its own row cleanup (e.g. via t.Cleanup with a
// `LIKE 'cmsit-%'` DELETE).
func RequireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	dbOnce.Do(func() {
		if err := db.Migrate(url, migrations.FS); err != nil {
			dbErr = err
			return
		}
		dbPool, dbErr = pgxpool.New(context.Background(), url)
	})
	if dbErr != nil {
		t.Fatalf("cms test db: %v", dbErr)
	}
	return dbPool
}
