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

	pages, total, err := repo.ListPages(ctx, PageListParams{Page: 1, PageSize: 50})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(pages), 2)
	require.GreaterOrEqual(t, total, 2)

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

// Deleting a page that still has a leftover child detaches the child and goes
// ahead: nothing can re-parent it any more, so refusing would strand the page.
func TestIT_PageDeleteDetachesLeftoverChildren(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pdel-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itPageWrite("cmsit-pdelc-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreatePage(ctx, cw)
	require.NoError(t, err)

	require.NoError(t, repo.DeletePage(ctx, root.ID))
	kept, err := repo.GetPage(ctx, child.ID)
	require.NoError(t, err)
	require.Nil(t, kept.ParentID)
}

func TestIT_PageUpdateIsOptimisticallyLocked(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pupd-"+uuid.NewString()[:8]))
	require.NoError(t, err)

	w := itPageWrite(root.Slug)
	w.Title = "cmsit-changed"
	stale := root.UpdatedAt.Add(-time.Hour)
	_, err = repo.UpdatePage(ctx, root.ID, w, stale)
	require.ErrorIs(t, err, shared.ErrOptLock)
	upd, err := repo.UpdatePage(ctx, root.ID, w, root.UpdatedAt)
	require.NoError(t, err)
	require.Equal(t, "cmsit-changed", upd.Title)
}

// A row that carries a parent from before keeps it: the column was left in
// place, and an ordinary save must not quietly move the page to the root.
func TestIT_PageUpdateKeepsAnExistingParent(t *testing.T) {
	repo := pagesDB(t)
	ctx := context.Background()
	root, err := repo.CreatePage(ctx, itPageWrite("cmsit-pkeep-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itPageWrite("cmsit-pkeepc-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreatePage(ctx, cw)
	require.NoError(t, err)

	// What the service sends on a save: the current row, merged with the edit.
	w := itPageWrite(child.Slug)
	w.ParentID = child.ParentID
	w.Title = "cmsit-kept"
	upd, err := repo.UpdatePage(ctx, child.ID, w, child.UpdatedAt)
	require.NoError(t, err)
	require.NotNil(t, upd.ParentID)
	require.Equal(t, root.ID, *upd.ParentID)
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

// itSlugs keeps only this run's rows, so a count can be compared against the
// rows that matched.
func itSlugs(rows []Page, token string) []string {
	out := []string{}
	for _, p := range rows {
		if strings.HasPrefix(p.Slug, token) {
			out = append(out, p.Slug)
		}
	}
	sort.Strings(out)
	return out
}

func TestIT_PageCreatedRangeIncludesAndExcludes(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	seed("before", nil, time.Date(2026, 10, 9, 23, 59, 59, 0, vnZone))
	seed("inside", nil, time.Date(2026, 10, 11, 9, 0, 0, 0, vnZone))
	seed("after", nil, time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	rows, _, err := repo.ListPages(context.Background(), PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-10"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
		Page:        1,
		PageSize:    50,
	})
	require.NoError(t, err)
	require.Equal(t, []string{token + "-inside"}, itSlugs(rows, token))
}

// The last second of created_to is inside the range: "to 13 Oct" means through
// the end of 13 Oct, Vietnam time.
func TestIT_PageCreatedToIsInclusiveOfTheWholeDay(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	seed("lastsecond", nil, time.Date(2026, 10, 13, 23, 59, 59, 0, vnZone))
	seed("nextmidnight", nil, time.Date(2026, 10, 14, 0, 0, 0, 0, vnZone))

	rows, _, err := repo.ListPages(context.Background(), PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-13"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-13"),
		Page:        1,
		PageSize:    50,
	})
	require.NoError(t, err)
	require.Equal(t, []string{token + "-lastsecond"}, itSlugs(rows, token))
}

// A page of results reports the WHOLE match count, not the size of the slice:
// the pager draws its page numbers from it.
func TestIT_PageListPagesAndCountsTheWholeMatch(t *testing.T) {
	repo, token, seed := itPageRangeFixture(t)
	day := time.Date(2026, 10, 11, 9, 0, 0, 0, vnZone)
	seed("one", nil, day)
	seed("two", nil, day)
	seed("three", nil, day)

	params := PageListParams{
		CreatedFrom: itDayVN(t, "2026-10-11"),
		CreatedTo:   itEndOfDayVN(t, "2026-10-11"),
		Page:        1,
		PageSize:    2,
	}
	first, total, err := repo.ListPages(context.Background(), params)
	require.NoError(t, err)
	require.Len(t, itSlugs(first, token), 2)
	require.Equal(t, 3, total)

	params.Page = 2
	second, total, err := repo.ListPages(context.Background(), params)
	require.NoError(t, err)
	require.Len(t, itSlugs(second, token), 1)
	require.Equal(t, 3, total)
}
