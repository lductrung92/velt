package articles

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func articlesDB(t *testing.T) (Repository, *pgxpool.Pool) {
	t.Helper()
	pool := cmstest.RequireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_articles WHERE title LIKE 'cmsit-%' OR slug LIKE 'cmsit-%'`)
		_, _ = pool.Exec(ctx, `DELETE FROM cms_tags WHERE slug LIKE 'cmsit-%'`)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'cmsit-%@x.test'`)
	})
	return NewRepository(pool), pool
}

func itUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'CMS IT') RETURNING id`,
		"cmsit-"+uuid.NewString()+"@x.test").Scan(&id))
	return id
}

func itTag(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO cms_tags (name, slug) VALUES ('AT', $1) RETURNING id`,
		"cmsit-at-"+uuid.NewString()[:8]).Scan(&id))
	return id
}

func itArticleWrite(slug string) articleWrite { return articleWrite{Title: "cmsit-art", Slug: slug} }

func draftSW() articleStatusWrite { return articleStatusWrite{Status: ArticleStatusDraft} }

func TestIT_ArticleCRUDTagsAndPublish(t *testing.T) {
	repo, pool := articlesDB(t)
	ctx := context.Background()
	author := itUser(t, pool)
	tagID := itTag(t, pool)

	a, err := repo.CreateArticle(ctx, itArticleWrite("cmsit-art-"+uuid.NewString()[:8]), author, "editor", draftSW(), []uuid.UUID{tagID})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusDraft, a.Status)
	require.Equal(t, author, a.AuthorID)
	require.Equal(t, "editor", a.AuthorRole)

	tags, err := repo.ArticleTags(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, tags, 1)

	rows, total, err := repo.ListArticles(ctx, ArticleListParams{AuthorID: &author, Page: 1, PageSize: 20})
	require.NoError(t, err)
	require.GreaterOrEqual(t, total, 1)
	require.NotEmpty(t, rows)

	w := itArticleWrite(a.Slug)
	w.Title = "cmsit-pubbed"
	pubSW := articleStatusWrite{Status: ArticleStatusPublished, Snapshot: []byte(`{"slug":"snap"}`)}
	pub, err := repo.UpdateArticle(ctx, a.ID, w, pubSW, a.UpdatedAt, nil)
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, pub.Status)
	require.NotNil(t, pub.PublishedAt)
	require.JSONEq(t, `{"slug":"snap"}`, string(pub.PublishedSnapshot))

	nr := articleStatusWrite{Status: ArticleStatusNeedsRevision, ReviewNote: cmstest.Strptr("fix it")}
	got, err := repo.UpdateArticle(ctx, a.ID, w, nr, pub.UpdatedAt, nil)
	require.NoError(t, err)
	require.Equal(t, ArticleStatusNeedsRevision, got.Status)
	require.NotNil(t, got.ReviewNote)
	require.Equal(t, "fix it", *got.ReviewNote)
}

func TestIT_ArticleScheduleViaCreate(t *testing.T) {
	repo, pool := articlesDB(t)
	ctx := context.Background()
	author := itUser(t, pool)
	when := time.Now().Add(72 * time.Hour).UTC().Truncate(time.Second)
	sw := articleStatusWrite{Status: ArticleStatusScheduled, PublishAt: &when}
	a, err := repo.CreateArticle(ctx, itArticleWrite("cmsit-asch-"+uuid.NewString()[:8]), author, "admin", sw, nil)
	require.NoError(t, err)
	require.Equal(t, ArticleStatusScheduled, a.Status)
	require.NotNil(t, a.PublishedAt)
	require.WithinDuration(t, when, *a.PublishedAt, time.Second)
	require.Equal(t, "admin", a.AuthorRole)
}

func TestIT_ArticleSlugUnique(t *testing.T) {
	repo, pool := articlesDB(t)
	ctx := context.Background()
	author := itUser(t, pool)
	slug := "cmsit-aslug-" + uuid.NewString()[:8]
	_, err := repo.CreateArticle(ctx, itArticleWrite(slug), author, "editor", draftSW(), nil)
	require.NoError(t, err)
	_, err = repo.CreateArticle(ctx, itArticleWrite(slug), author, "editor", draftSW(), nil)
	require.ErrorIs(t, err, shared.ErrConflict)
}

func TestIT_ArticleOptimisticLock(t *testing.T) {
	repo, pool := articlesDB(t)
	ctx := context.Background()
	author := itUser(t, pool)
	a, err := repo.CreateArticle(ctx, itArticleWrite("cmsit-aopt-"+uuid.NewString()[:8]), author, "editor", draftSW(), nil)
	require.NoError(t, err)

	w := itArticleWrite(a.Slug)
	w.Title = "cmsit-changed"
	stale := a.UpdatedAt.Add(-time.Hour)
	_, err = repo.UpdateArticle(ctx, a.ID, w, draftSW(), stale, nil)
	require.ErrorIs(t, err, shared.ErrOptLock)

	upd, err := repo.UpdateArticle(ctx, a.ID, w, draftSW(), a.UpdatedAt, nil)
	require.NoError(t, err)
	require.Equal(t, "cmsit-changed", upd.Title)
}

// Sorting by status used to be a no-op: the console offered the column, the
// clause had no arm for it, and the rows came back in the default updated_at
// order. The assertion is on the workflow rank, not the alphabet.
func TestIT_ArticleSortByStatus(t *testing.T) {
	repo, pool := articlesDB(t)
	ctx := context.Background()
	author := itUser(t, pool)

	// Deliberately scrambled: creating them in workflow order (or its reverse)
	// would make the default updated_at DESC order match one of the two
	// assertions below, and that direction would then pass without the clause
	// doing anything. This order matches neither.
	for _, st := range []string{
		ArticleStatusScheduled, ArticleStatusDraft, ArticleStatusArchived,
		ArticleStatusNeedsRevision, ArticleStatusPublished, ArticleStatusPendingReview,
	} {
		sw := articleStatusWrite{Status: st}
		if st == ArticleStatusScheduled {
			at := time.Now().Add(48 * time.Hour).UTC().Truncate(time.Second)
			sw.PublishAt = &at
		}
		_, err := repo.CreateArticle(ctx, itArticleWrite("cmsit-sort-"+uuid.NewString()[:8]), author, "admin", sw, nil)
		require.NoError(t, err)
	}

	statuses := func(sort string) []string {
		rows, _, err := repo.ListArticles(ctx, ArticleListParams{
			AuthorID: &author, Sort: sort, Page: 1, PageSize: 20,
		})
		require.NoError(t, err)
		out := make([]string, 0, len(rows))
		for _, r := range rows {
			out = append(out, r.Status)
		}
		return out
	}

	workflow := []string{
		ArticleStatusDraft, ArticleStatusPendingReview, ArticleStatusNeedsRevision,
		ArticleStatusScheduled, ArticleStatusPublished, ArticleStatusArchived,
	}
	require.Equal(t, workflow, statuses("status"))

	reversed := make([]string, len(workflow))
	for i, s := range workflow {
		reversed[len(workflow)-1-i] = s
	}
	require.Equal(t, reversed, statuses("-status"))
}

// --- created_at range filter ---

// vnZone is the Vietnam offset the console works in; the created_at fixtures
// below are written as the wall-clock times an editor in Hanoi would have seen.
var vnZone = time.FixedZone("+07", 7*60*60)

func itDayVN(t *testing.T, day string) *time.Time {
	t.Helper()
	d, err := time.ParseInLocation("2006-01-02", day, vnZone)
	require.NoError(t, err)
	return &d
}

// itEndOfDayVN is the exclusive upper bound httpx.QueryDateRange produces for
// created_to=day: midnight at the start of the following day.
func itEndOfDayVN(t *testing.T, day string) *time.Time {
	t.Helper()
	end := itDayVN(t, day).AddDate(0, 0, 1)
	return &end
}

// itRangeFixture seeds three articles sharing a per-run title token, so a
// Query on that token narrows both the rows AND the total to this run.
func itRangeFixture(t *testing.T) (Repository, string, func(name string, createdAt time.Time)) {
	t.Helper()
	repo, pool := articlesDB(t)
	author := itUser(t, pool)
	token := "cmsit-" + uuid.NewString()[:8]
	seed := func(name string, createdAt time.Time) {
		t.Helper()
		_, err := pool.Exec(context.Background(),
			`INSERT INTO cms_articles (title, slug, author_id, created_at) VALUES ($1, $2, $3, $4)`,
			token+"-"+name, token+"-"+name, author, createdAt)
		require.NoError(t, err)
	}
	return repo, token, seed
}

func itListTitles(t *testing.T, repo Repository, p ArticleListParams) ([]string, int) {
	t.Helper()
	p.Page, p.PageSize = 1, 100
	rows, total, err := repo.ListArticles(context.Background(), p)
	require.NoError(t, err)
	out := []string{}
	for _, r := range rows {
		out = append(out, r.Title)
	}
	return out, total
}

func TestIT_ArticleCreatedRangeIncludesAndExcludes(t *testing.T) {
	repo, token, seed := itRangeFixture(t)
	seed("before", time.Date(2026, 10, 9, 23, 59, 59, 0, vnZone))
	seed("inside", time.Date(2026, 10, 11, 9, 0, 0, 0, vnZone))
	seed("after", time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	titles, total := itListTitles(t, repo, ArticleListParams{
		Query:       token,
		CreatedFrom: itDayVN(t, "2026-10-10"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
	})
	require.Equal(t, []string{token + "-inside"}, titles)
	// The count the dashboard reads must agree with the rows under it.
	require.Equal(t, 1, total)
}

// The last second of created_to is inside the range: "to 13 Oct" means through
// the end of 13 Oct, Vietnam time.
func TestIT_ArticleCreatedToIsInclusiveOfTheWholeDay(t *testing.T) {
	repo, token, seed := itRangeFixture(t)
	seed("lastsecond", time.Date(2026, 10, 13, 23, 59, 59, 0, vnZone))
	seed("nextmidnight", time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	titles, total := itListTitles(t, repo, ArticleListParams{
		Query:       token,
		CreatedFrom: itDayVN(t, "2026-10-13"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
	})
	require.Equal(t, []string{token + "-lastsecond"}, titles)
	require.Equal(t, 1, total)
}
