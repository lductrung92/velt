package regions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// itSlot is a throwaway slot name per test. The vocabulary is enforced in Go,
// not by the column, so an integration test can own a list of its own and
// clean up after itself without touching the real ones.
func itSlot() string { return "cmsit-" + uuid.NewString()[:8] }

func cleanupIT(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_region_blocks WHERE region LIKE 'cmsit-%'`)
		_, _ = pool.Exec(ctx, `DELETE FROM cms_menus WHERE location LIKE 'cmsit-%'`) // blocks cascade
	})
}

func widgetWrite(typ string) blockWrite {
	return blockWrite{Kind: KindWidget, WidgetType: &typ, Config: json.RawMessage(`{}`), IsVisible: true}
}

// fakeMenus stands in for menus.PublicService: regions must not import a
// sibling feature, and the resolution itself is tested where it lives.
type fakeMenus map[uuid.UUID]any

func (f fakeMenus) ItemsByMenu(_ context.Context, _ string) (map[uuid.UUID]any, error) {
	return f, nil
}

func publicSvc(pool *pgxpool.Pool, ports widgets.Ports, menus MenuPort) *PublicService {
	return NewPublicService(NewPublicRepository(pool), widgets.NewResolver(ports), menus,
		slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// A block that comes back with its id keeps that id. The id is the anchor the
// editor's screen holds a block by, so handing out a new one on every save
// would quietly detach whatever is pointed at it.
func TestIT_RegionBlocksKeepTheirIDsAcrossSaves(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	cleanupIT(t, pool)

	slot := itSlot()
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupCommon, slot, []blockWrite{
		widgetWrite(widgets.TypeTeam),
		widgetWrite(widgets.TypeArticlesList),
		widgetWrite(widgets.TypeCTABanner),
	}))

	first, err := repo.RegionBlocks(ctx, GroupCommon, slot)
	require.NoError(t, err)
	require.Len(t, first, 3)
	kept, dropped := first[0], first[2]

	// Save again: one block comes back with its id and new config, one is left
	// out, and one is new.
	reordered := widgetWrite(widgets.TypeTeam)
	reordered.ID = &kept.ID
	reordered.Config = json.RawMessage(`{"limit": 4}`)
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupCommon, slot, []blockWrite{
		widgetWrite(widgets.TypeGamesList),
		reordered,
	}))

	second, err := repo.RegionBlocks(ctx, GroupCommon, slot)
	require.NoError(t, err)
	require.Len(t, second, 2)
	byID := map[uuid.UUID]blockRow{}
	for _, b := range second {
		byID[b.ID] = b
	}
	require.Contains(t, byID, kept.ID, "a block sent back with its id must survive the save")
	require.JSONEq(t, `{"limit": 4}`, string(byID[kept.ID].Config))
	require.NotContains(t, byID, dropped.ID, "a block left out of the list is deleted")
	require.Equal(t, kept.ID, second[1].ID, "sort_order follows the slice order it was sent in")

	// An id belonging to another list is not ours to take: it is inserted
	// fresh, leaving the block where it was. The same SLOT of another GROUP is
	// the case the group column has to carry — before it, these were one list.
	stolen := widgetWrite(widgets.TypeTeam)
	stolen.ID = &kept.ID
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupBlogDetail, slot, []blockWrite{stolen}))
	mine, err := repo.RegionBlocks(ctx, GroupCommon, slot)
	require.NoError(t, err)
	require.Len(t, mine, 2, "the other group must not have taken a block from this one")
	theirs, err := repo.RegionBlocks(ctx, GroupBlogDetail, slot)
	require.NoError(t, err)
	require.Len(t, theirs, 1)
	require.NotEqual(t, kept.ID, theirs[0].ID)
}

// A slot whose blocks are all hidden is absent from the public map, not
// present and empty: the site renders the chrome it ships with when a slot
// says nothing, so hiding the last block cannot blank the header.
//
// A GROUP whose every slot went that way is absent for the same reason — were
// it present and empty, the site's walk up the tree would still have to reach
// past it to the ancestor that does have a list.
func TestIT_PublicChromeOmitsASlotWithNoVisibleBlocks(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	cleanupIT(t, pool)

	hidden, shown := itSlot(), itSlot()
	invisible := widgetWrite(widgets.TypeTeam)
	invisible.IsVisible = false
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupBlogDetail, hidden, []blockWrite{invisible}))
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupCommon, shown, []blockWrite{widgetWrite(widgets.TypeTeam)}))

	out, err := publicSvc(pool, widgets.Ports{}, fakeMenus{}).Chrome(ctx, "vi")
	require.NoError(t, err)
	require.NotContains(t, out, GroupBlogDetail, "a group whose every block is hidden reads as not configured")
	require.NotContains(t, out[GroupCommon], hidden)
	require.Len(t, out[GroupCommon][shown], 1)
	// The config travels too: a static widget resolves to nil data and would
	// render as nothing without it.
	require.Equal(t, resolvedWidget{Kind: KindWidget, WidgetType: widgets.TypeTeam,
		Config: json.RawMessage("{}"),
		Data:   map[string]any{"items": []widgets.MemberItem{}}}, out[GroupCommon][shown][0])
}

// A menu that resolves to nothing takes its block with it and leaves the rest
// of the region standing: this response renders every page's chrome, and one
// bad block must not blank the site.
func TestIT_PublicChromeDropsAMenuBlockThatDoesNotResolve(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	cleanupIT(t, pool)

	var menuID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO cms_menus (name, location) VALUES ($1, $2) RETURNING id`,
		"Chrome IT", "cmsit-"+uuid.NewString()[:8]).Scan(&menuID))

	slot := itSlot()
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupCommon, slot, []blockWrite{
		{Kind: KindMenu, MenuID: &menuID, Config: json.RawMessage(`{}`), IsVisible: true},
		widgetWrite(widgets.TypeTeam),
	}))

	// The menu is absent from the resolution: deleted, or with nothing left to
	// render — one accident with two spellings.
	out, err := publicSvc(pool, widgets.Ports{}, fakeMenus{}).Chrome(ctx, "vi")
	require.NoError(t, err)
	require.Len(t, out[GroupCommon][slot], 1, "the menu block is dropped, the widget still renders")
	require.Equal(t, KindWidget, out[GroupCommon][slot][0].(resolvedWidget).Kind)

	// The same menu, resolved, is carried through as the navigation read
	// shaped it.
	items := []map[string]any{{"label": "Trang chủ"}}
	out, err = publicSvc(pool, widgets.Ports{}, fakeMenus{menuID: items}).Chrome(ctx, "vi")
	require.NoError(t, err)
	require.Len(t, out[GroupCommon][slot], 2)
	require.Equal(t, resolvedMenu{Kind: KindMenu, Items: items}, out[GroupCommon][slot][0])
}

// A widget whose data source is down is dropped for the same reason a menu is.
type brokenMembers struct{}

func (brokenMembers) ListMembers(_ context.Context, _ widgets.MembersQuery) ([]widgets.MemberItem, error) {
	return nil, errors.New("roster unavailable")
}

func TestIT_PublicChromeDropsAWidgetThatFailsToResolve(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	cleanupIT(t, pool)

	slot := itSlot()
	require.NoError(t, repo.ReplaceRegionBlocks(ctx, GroupCommon, slot, []blockWrite{
		widgetWrite(widgets.TypeTeam),
		widgetWrite(widgets.TypeCTABanner),
	}))

	out, err := publicSvc(pool, widgets.Ports{Members: brokenMembers{}}, fakeMenus{}).Chrome(ctx, "vi")
	require.NoError(t, err)
	require.Len(t, out[GroupCommon][slot], 1, "the broken widget is dropped, the static one still renders")
	require.Equal(t, widgets.TypeCTABanner, out[GroupCommon][slot][0].(resolvedWidget).WidgetType)
}
