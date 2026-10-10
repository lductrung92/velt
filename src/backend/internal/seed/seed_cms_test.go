package seed

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestPublishedAtFor(t *testing.T) {
	now := time.Date(2026, 1, 10, 12, 0, 0, 0, time.UTC)
	pub := publishedAtFor("published", now, 3)
	require.NotNil(t, pub)
	require.True(t, pub.Before(now), "published is dated in the past")

	sch := publishedAtFor("scheduled", now, 3)
	require.NotNil(t, sch)
	require.True(t, sch.After(now), "scheduled is dated in the future")

	for _, s := range []string{"draft", "pending_review", "needs_revision", "archived"} {
		require.Nil(t, publishedAtFor(s, now, 1), "%s carries no published_at", s)
	}
}

// articleStatuses must list exactly the cms_articles status CHECK set so seeded
// rows can never violate the constraint.
func TestArticleStatusesMatchConstraint(t *testing.T) {
	want := map[string]bool{
		"draft": true, "pending_review": true, "needs_revision": true,
		"scheduled": true, "published": true, "archived": true,
	}
	require.Len(t, articleStatuses, len(want))
	for _, s := range articleStatuses {
		require.True(t, want[s], "unexpected status %q", s)
	}
}

// --- Integration (requires TEST_DATABASE_URL) ---

func cleanupCMSSeed(t *testing.T, pool *pgxpool.Pool) {
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_articles WHERE slug LIKE $1`, seedArticleSlugPrefix+"%")
		_, _ = pool.Exec(ctx, `UPDATE cms_categories SET parent_id = NULL WHERE slug LIKE $1`, seedCategorySlugPrefix+"%")
		_, _ = pool.Exec(ctx, `DELETE FROM cms_categories WHERE slug LIKE $1`, seedCategorySlugPrefix+"%")
		_, _ = pool.Exec(ctx, `DELETE FROM cms_tags WHERE slug LIKE $1`, seedTagSlugPrefix+"%")
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE '%@' || $1 OR email = $2`, SeedDomain, SuperAdminEmail)
	})
}

func TestIT_CMSSeedAndIdempotent(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	cleanupCMSSeed(t, pool)

	// CMS articles need the bootstrap super_admin as author.
	_, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 0, Reset: true})
	require.NoError(t, err)

	opts := CMSOptions{Tags: 100, Categories: 5, Articles: 25, Reset: true}
	sum, err := CMS(ctx, pool, opts)
	require.NoError(t, err)
	require.Equal(t, 100, sum.Tags)
	require.Equal(t, 5, sum.Categories)
	require.Equal(t, 25, sum.Articles)
	require.Positive(t, sum.ArticleTags)

	// Counts landed in the DB.
	require.Equal(t, 100, countLike(t, pool, "cms_tags", seedTagSlugPrefix))
	require.Equal(t, 5, countLike(t, pool, "cms_categories", seedCategorySlugPrefix))
	require.Equal(t, 25, countLike(t, pool, "cms_articles", seedArticleSlugPrefix))

	// Every workflow status is represented.
	var distinctStatuses int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(DISTINCT status) FROM cms_articles WHERE slug LIKE $1`, seedArticleSlugPrefix+"%").
		Scan(&distinctStatuses))
	require.Equal(t, len(articleStatuses), distinctStatuses)

	// Published articles carry published_at.
	var publishedNoDate int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM cms_articles WHERE slug LIKE $1 AND status = 'published' AND published_at IS NULL`,
		seedArticleSlugPrefix+"%").Scan(&publishedNoDate))
	require.Zero(t, publishedNoDate, "published seed articles must have published_at")

	// Categories are seeded as a flat top-level set (no parent links).
	var children int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM cms_categories WHERE slug LIKE $1 AND parent_id IS NOT NULL`,
		seedCategorySlugPrefix+"%").Scan(&children))
	require.Zero(t, children, "seeded categories are flat (no parent links)")

	// Idempotent re-run without reset → nothing new created, everything skipped.
	sum2, err := CMS(ctx, pool, CMSOptions{Tags: 100, Categories: 5, Articles: 25})
	require.NoError(t, err)
	require.Zero(t, sum2.Tags)
	require.Zero(t, sum2.Categories)
	require.Zero(t, sum2.Articles)
	require.Equal(t, 130, sum2.Skipped) // 100 + 5 + 25 already present
}

func TestIT_CMSReset(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	cleanupCMSSeed(t, pool)

	_, err := Users(ctx, pool, Options{Password: "seed-password-123", Count: 0, Reset: true})
	require.NoError(t, err)

	_, err = CMS(ctx, pool, CMSOptions{Tags: 10, Categories: 5, Articles: 8, Reset: true})
	require.NoError(t, err)

	sum, err := CMS(ctx, pool, CMSOptions{Tags: 10, Categories: 5, Articles: 8, Reset: true})
	require.NoError(t, err)
	require.Equal(t, 10+5+8, sum.Deleted, "reset removes the prior seed-* CMS rows")
	require.Equal(t, 10, sum.Tags)
	require.Equal(t, 5, sum.Categories)
	require.Equal(t, 8, sum.Articles)
}

func TestIT_CMSRequiresSuperAdmin(t *testing.T) {
	pool := requireDB(t)
	ctx := context.Background()
	cleanupCMSSeed(t, pool)

	// No user seeding → super_admin absent → CMS seeding fails fast (clear error).
	_, err := pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, SuperAdminEmail)
	require.NoError(t, err)
	_, err = CMS(ctx, pool, CMSOptions{Tags: 1, Categories: 1, Articles: 1})
	require.Error(t, err)
}

func countLike(t *testing.T, pool *pgxpool.Pool, table, slugPrefix string) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM `+table+` WHERE slug LIKE $1`, slugPrefix+"%").Scan(&n))
	return n
}
