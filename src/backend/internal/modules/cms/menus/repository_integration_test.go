package menus

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func strptr(s string) *string         { return &s }
func ptrUUID(id uuid.UUID) *uuid.UUID { return &id }

func TestIT_MenuCRUDAndLocationUnique(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_menus WHERE location LIKE 'cmsit-%'`) // items cascade
	})

	loc := "cmsit-" + uuid.NewString()[:8]
	m, err := repo.CreateMenu(ctx, "CMS IT Menu", loc)
	require.NoError(t, err)
	require.Equal(t, loc, m.Location)

	_, err = repo.CreateMenu(ctx, "Dup", loc) // location UNIQUE
	require.ErrorIs(t, err, shared.ErrConflict)

	upd, err := repo.UpdateMenu(ctx, m.ID, "Renamed", loc)
	require.NoError(t, err)
	require.Equal(t, "Renamed", upd.Name)

	require.NoError(t, repo.DeleteMenu(ctx, m.ID))
	_, err = repo.GetMenu(ctx, m.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestIT_MenuReplaceItemsTreeAndCascade(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_menus WHERE location LIKE 'cmsit-%'`)
	})

	m, err := repo.CreateMenu(ctx, "CMS IT Menu", "cmsit-"+uuid.NewString()[:8])
	require.NoError(t, err)

	tree := []itemWrite{
		{Label: "Home", LinkType: LinkInternal, URL: strptr("/")},
		{Label: "Blog", LinkType: LinkArticle, TargetID: ptrUUID(uuid.New()), Children: []itemWrite{
			{Label: "Sub", LinkType: LinkExternal, URL: strptr("https://example.com"), OpenNewTab: true},
		}},
	}
	require.NoError(t, repo.ReplaceMenuItems(ctx, m.ID, tree))

	rows, err := repo.MenuItems(ctx, m.ID)
	require.NoError(t, err)
	require.Len(t, rows, 3) // Home, Blog, Sub
	children := 0
	for _, r := range rows {
		if r.ParentID != nil {
			children++
			require.Equal(t, LinkExternal, r.LinkType)
		}
	}
	require.Equal(t, 1, children)

	// Replace with a smaller tree → old items gone.
	require.NoError(t, repo.ReplaceMenuItems(ctx, m.ID, []itemWrite{{Label: "Only", LinkType: LinkInternal, URL: strptr("/x")}}))
	rows, err = repo.MenuItems(ctx, m.ID)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	// Delete menu → items cascade.
	require.NoError(t, repo.DeleteMenu(ctx, m.ID))
	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM cms_menu_items WHERE menu_id = $1`, m.ID).Scan(&n))
	require.Equal(t, 0, n)
}
