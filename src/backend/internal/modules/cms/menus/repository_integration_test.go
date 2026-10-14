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

func TestIT_MenuCRUDAndSharedLocation(t *testing.T) {
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

	// A location holds as many menus as the editor wants (0042 dropped the
	// UNIQUE); the public read picks one of them, the database does not.
	second, err := repo.CreateMenu(ctx, "Second", loc)
	require.NoError(t, err)
	require.Equal(t, loc, second.Location)
	require.NotEqual(t, m.ID, second.ID)

	upd, err := repo.UpdateMenu(ctx, m.ID, "Renamed", loc)
	require.NoError(t, err)
	require.Equal(t, "Renamed", upd.Name)

	require.NoError(t, repo.DeleteMenu(ctx, m.ID))
	_, err = repo.GetMenu(ctx, m.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

// Two menus at one location, and the public read has one entry for it: the
// older menu is the one the site is handed. The younger menu was inserted
// first, so a reader going by insertion order would hand over the wrong one.
func TestIT_PublicMenusRendersTheOldestAtALocation(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_menus WHERE location LIKE 'cmsit-%'`)
	})

	loc := "cmsit-" + uuid.NewString()[:8]
	young, err := repo.CreateMenu(ctx, "Inserted first", loc)
	require.NoError(t, err)
	old, err := repo.CreateMenu(ctx, "Inserted second", loc)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`UPDATE cms_menus SET created_at = created_at - interval '1 day' WHERE id = $1`, old.ID)
	require.NoError(t, err)

	require.NoError(t, repo.ReplaceMenuItems(ctx, young.ID,
		[]itemWrite{{Label: "Young", LinkType: LinkInternal, URL: strptr("/young")}}))
	require.NoError(t, repo.ReplaceMenuItems(ctx, old.ID,
		[]itemWrite{{Label: "Old", LinkType: LinkInternal, URL: strptr("/old")}}))

	out, err := NewPublicService(NewPublicRepository(pool)).Menus(ctx, baseLocale)
	require.NoError(t, err)
	require.Equal(t, []string{"Old"}, publicLabels(out[loc]))
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

// An item that comes back with its id keeps that id. Anything stored against
// the item — its translated label — is attached by id, so an id that changed on
// every save would silently orphan the translation the editor just wrote.
func TestIT_MenuItemsKeepTheirIDsAcrossSaves(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_menus WHERE location LIKE 'cmsit-%'`)
	})

	m, err := repo.CreateMenu(ctx, "Stable", "cmsit-"+uuid.NewString()[:8])
	require.NoError(t, err)
	require.NoError(t, repo.ReplaceMenuItems(ctx, m.ID, []itemWrite{
		{Label: "Products", LinkType: LinkInternal, URL: strptr("/products"), Children: []itemWrite{
			{Label: "Child", LinkType: LinkInternal, URL: strptr("/c")},
		}},
		{Label: "Gone", LinkType: LinkInternal, URL: strptr("/gone")},
	}))

	first, err := repo.MenuItems(ctx, m.ID)
	require.NoError(t, err)
	require.Len(t, first, 3)
	byLabel := map[string]itemRow{}
	for _, r := range first {
		byLabel[r.Label] = r
	}

	// Save again: the renamed parent and its child come back with their ids,
	// one item is dropped, and one is new.
	parent := byLabel["Products"]
	child := byLabel["Child"]
	require.NoError(t, repo.ReplaceMenuItems(ctx, m.ID, []itemWrite{
		{ID: &parent.ID, Label: "Sản phẩm", LinkType: LinkInternal, URL: strptr("/products"),
			Children: []itemWrite{
				{ID: &child.ID, Label: "Child", LinkType: LinkInternal, URL: strptr("/c")},
			}},
		{Label: "Fresh", LinkType: LinkInternal, URL: strptr("/fresh")},
	}))

	second, err := repo.MenuItems(ctx, m.ID)
	require.NoError(t, err)
	require.Len(t, second, 3)
	kept := map[uuid.UUID]itemRow{}
	for _, r := range second {
		kept[r.ID] = r
	}
	require.Contains(t, kept, parent.ID, "the parent must survive its own rename")
	require.Equal(t, "Sản phẩm", kept[parent.ID].Label)
	require.Contains(t, kept, child.ID, "a child must keep its id too")
	require.Equal(t, parent.ID, *kept[child.ID].ParentID)
	require.NotContains(t, kept, byLabel["Gone"].ID, "an item left out of the tree is deleted")

	// An id belonging to another menu is not ours to take: it is inserted fresh.
	other, err := repo.CreateMenu(ctx, "Other", "cmsit-"+uuid.NewString()[:8])
	require.NoError(t, err)
	require.NoError(t, repo.ReplaceMenuItems(ctx, other.ID, []itemWrite{
		{ID: &parent.ID, Label: "Stolen", LinkType: LinkInternal, URL: strptr("/x")},
	}))
	mine, err := repo.MenuItems(ctx, m.ID)
	require.NoError(t, err)
	require.Len(t, mine, 3, "the other menu must not have taken an item from this one")
	theirs, err := repo.MenuItems(ctx, other.ID)
	require.NoError(t, err)
	require.Len(t, theirs, 1)
	require.NotEqual(t, parent.ID, theirs[0].ID)
}
