package pages

import (
	"context"
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

	pages, err := repo.ListPages(ctx)
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
