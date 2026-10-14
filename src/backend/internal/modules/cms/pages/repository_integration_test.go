package pages

import (
	"context"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func pagesDB(t *testing.T) Repository {
	t.Helper()
	pool := cmstest.RequireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_pages WHERE slug LIKE 'cmsit-%' AND parent_id IS NOT NULL`)
		_, _ = pool.Exec(ctx, `DELETE FROM cms_pages WHERE slug LIKE 'cmsit-%'`)
	})
	return NewRepository(pool)
}

func itPageWrite(slug string) pageWrite { return pageWrite{Title: "CMS IT Page", Slug: slug} }

func TestIT_PageCRUDTreeAndPublish(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()

	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-proot-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	require.Equal(t, PageStatusDraft, root.Status)

	cw := itPageWrite("cmsit-pchild-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreatePage(ctx, cw)
	require.NoError(t, err)

	pages, err := repo.ListPages(ctx, PageListParams{})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(pages), 2)

	hc, err := repo.PageHasChildren(ctx, root.ID)
	require.NoError(t, err)
	require.True(t, hc)

	pub, err := repo.PublishPage(ctx, root.ID, []byte(`{"slug":"x"}`))
	require.NoError(t, err)
	require.Equal(t, PageStatusPublished, pub.Status)
	require.NotNil(t, pub.PublishedAt)
	require.JSONEq(t, `{"slug":"x"}`, string(pub.PublishedSnapshot))

	_, err = repo.PublishPage(ctx, root.ID, []byte(`{}`))
	require.ErrorIs(t, err, shared.ErrInvalidStatus)

	unp, err := repo.UnpublishPage(ctx, root.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusArchived, unp.Status)
	_, err = repo.UnpublishPage(ctx, root.ID)
	require.ErrorIs(t, err, shared.ErrInvalidStatus)

	require.NoError(t, repo.DeletePage(ctx, child.ID))
	require.NoError(t, repo.DeletePage(ctx, root.ID))
	_, err = repo.GetPage(ctx, root.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestIT_PageRootSlugUnique(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	slug := "cmsit-puniq-" + uuid.NewString()[:8]
	_, err := repo.CreatePage(ctx, itPageWrite(slug))
	require.NoError(t, err)
	_, err = repo.CreatePage(ctx, itPageWrite(slug))
	require.ErrorIs(t, err, shared.ErrConflict)
}

func TestIT_PageDeleteWithChildrenRefuses(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pdel-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itPageWrite("cmsit-pdelc-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	_, err = repo.CreatePage(ctx, cw)
	require.NoError(t, err)
	require.ErrorIs(t, repo.DeletePage(ctx, root.ID), shared.ErrInUse)
}

func TestIT_PageCycleDetection(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pcyc-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itPageWrite("cmsit-pcycc-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreatePage(ctx, cw)
	require.NoError(t, err)
	cyc, err := repo.PageCreatesCycle(ctx, root.ID, child.ID)
	require.NoError(t, err)
	require.True(t, cyc)
}

func TestIT_PageUpdateOptLockAndCycleRecheck(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pupd-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itPageWrite("cmsit-pupc-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreatePage(ctx, cw)
	require.NoError(t, err)

	w := itPageWrite(root.Slug)
	w.Title = "cmsit-changed"
	stale := root.UpdatedAt.Add(-time.Hour)
	_, err = repo.UpdatePage(ctx, root.ID, w, stale, false)
	require.ErrorIs(t, err, shared.ErrOptLock)
	upd, err := repo.UpdatePage(ctx, root.ID, w, root.UpdatedAt, false)
	require.NoError(t, err)
	require.Equal(t, "cmsit-changed", upd.Title)

	mw := itPageWrite(upd.Slug)
	mw.ParentID = &child.ID
	_, err = repo.UpdatePage(ctx, root.ID, mw, upd.UpdatedAt, true)
	require.ErrorIs(t, err, shared.ErrPageCycle)
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

// itPageRangeFixture seeds pages under a per-run slug token so the assertions
// below can ignore whatever else the target DB holds.
func itPageRangeFixture(t *testing.T) (Repository, string, func(name string, parent *uuid.UUID, createdAt time.Time) uuid.UUID) {
	t.Helper()
	pool := cmstest.RequireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_pages WHERE slug LIKE 'cmsit-%' AND parent_id IS NOT NULL`)
		_, _ = pool.Exec(ctx, `DELETE FROM cms_pages WHERE slug LIKE 'cmsit-%'`)
	})
	token := "cmsit-" + uuid.NewString()[:8]
	seed := func(name string, parent *uuid.UUID, createdAt time.Time) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO cms_pages (title, slug, parent_id, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
			token+"-"+name, token+"-"+name, parent, createdAt).Scan(&id))
		return id
	}
	return NewRepository(pool), token, seed
}

// itTreeSlugs flattens the tree the service builds, keeping only this run's
// rows, so a node count can be compared against the rows that matched.
func itTreeSlugs(tree []PageResponse, token string) []string {
	out := []string{}
	var walk func(nodes []PageResponse)
	walk = func(nodes []PageResponse) {
		for _, n := range nodes {
			if strings.HasPrefix(n.Slug, token) {
				out = append(out, n.Slug)
			}
			walk(n.Children)
		}
	}
	walk(tree)
	sort.Strings(out)
	return out
}

func TestIT_PageCreatedRangeIncludesAndExcludes(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	seed("before", nil, time.Date(2026, 10, 9, 23, 59, 59, 0, vnZone))
	seed("inside", nil, time.Date(2026, 10, 11, 9, 0, 0, 0, vnZone))
	seed("after", nil, time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	rows, err := repo.ListPages(context.Background(), PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-10"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
	})
	require.NoError(t, err)
	require.Equal(t, []string{token + "-inside"}, itTreeSlugs(buildPageTree(rows), token))
}

// The last second of created_to is inside the range: "to 13 Oct" means through
// the end of 13 Oct, Vietnam time.
func TestIT_PageCreatedToIsInclusiveOfTheWholeDay(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	seed("lastsecond", nil, time.Date(2026, 10, 13, 23, 59, 59, 0, vnZone))
	seed("nextmidnight", nil, time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	rows, err := repo.ListPages(context.Background(), PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-13"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
	})
	require.NoError(t, err)
	require.Equal(t, []string{token + "-lastsecond"}, itTreeSlugs(buildPageTree(rows), token))
}

// The tree shape must not smuggle extra rows past the filter: a child inside
// the range whose parent falls outside it surfaces as a root, so the number of
// nodes the console renders still equals the number of rows that matched.
func TestIT_PageInRangeChildOfOutOfRangeParentBecomesARoot(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	parent := seed("oldparent", nil, time.Date(2026, 9, 1, 10, 0, 0, 0, vnZone))
	seed("newchild", &parent, time.Date(2026, 10, 11, 10, 0, 0, 0, vnZone))

	rows, err := repo.ListPages(context.Background(), PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-10"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
	})
	require.NoError(t, err)
	tree := buildPageTree(rows)
	require.Equal(t, []string{token + "-newchild"}, itTreeSlugs(tree, token))

	var roots []string
	for _, n := range tree {
		if strings.HasPrefix(n.Slug, token) {
			roots = append(roots, n.Slug)
			require.Empty(t, n.Children)
		}
	}
	require.Equal(t, []string{token + "-newchild"}, roots)
}
