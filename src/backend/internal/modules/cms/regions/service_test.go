package regions

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

func widgetBlock(typ string, config string) BlockInput {
	return BlockInput{Kind: KindWidget, WidgetType: &typ, Config: json.RawMessage(config), IsVisible: true}
}

// The whole matrix is always there, filled or not: an editor cannot place a
// block in a slot the screen never offered them, and an empty slot is the one
// that inherits.
func TestRegions_ListAlwaysAnswersWithTheWholeMatrix(t *testing.T) {
	e := newTestSvc(t)
	out, err := e.svc.ListRegions(context.Background(), cmstest.ActorWith(permView))
	require.NoError(t, err)
	require.Len(t, out, len(Groups))
	for i, g := range out {
		require.Equal(t, Groups[i], g.Group, "groups come parent before child")
		require.Equal(t, parentOf[g.Group], g.Parent)
		slots := make([]string, 0, len(g.Slots))
		for _, sl := range g.Slots {
			slots = append(slots, sl.Slot)
			require.Empty(t, sl.Blocks, "an unconfigured slot is empty, not missing")
		}
		require.Equal(t, SlotsFor(g.Group), slots, g.Group)
	}
}

// The group tree is a tree: every chain ends at the root, so the site's walk
// up it terminates.
func TestRegions_EveryGroupReachesCommon(t *testing.T) {
	require.Equal(t, "", parentOf[GroupCommon])
	for _, group := range Groups {
		g, steps := group, 0
		for g != GroupCommon {
			g = parentOf[g]
			steps++
			require.Less(t, steps, len(Groups), "parent chain of %s does not reach common", group)
		}
	}
}

func TestRegions_ListRequiresPageView(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListRegions(context.Background(), cmstest.ActorWith())
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

// Reading the chrome and editing it are different gates: the page viewer sees
// the list, the menu manager changes it.
func TestRegions_ReplaceRequiresMenuManage(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permView), GroupCommon, SlotHeader, BlocksRequest{})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestRegions_ReplaceAcceptsEveryPairInTheMatrix(t *testing.T) {
	e := newTestSvc(t)
	for _, group := range Groups {
		for _, slot := range SlotsFor(group) {
			out, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), group, slot,
				BlocksRequest{Blocks: []BlockInput{widgetBlock(widgets.TypeTeam, `{}`)}})
			require.NoError(t, err, "%s/%s", group, slot)
			require.Equal(t, slot, out.Slot)
			require.Len(t, out.Blocks, 1)
		}
	}
}

// A group outside the tree is a value the caller got wrong, not a missing
// resource: 422 naming the field, like every other rejected input.
func TestRegions_ReplaceRejectsAnUnknownGroup(t *testing.T) {
	e := newTestSvc(t)
	// page_detail is in the list on purpose: the design names it, the site
	// does not route /{slug} yet, and until it does a block there would never
	// be drawn.
	for _, group := range []string{"", "page_detail", "Common", "common ", "sidebar_left"} {
		_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), group, SlotHeader, BlocksRequest{})
		cmstest.AssertFieldErr(t, err, "group", "unknown")
	}
}

// Both halves can be real and the pair still wrong. sidebar_left exists and
// home exists; a sidebar_left block on the home page is a row no page would
// ever draw, and nobody would be able to work out why it never shows.
func TestRegions_ReplaceRejectsAPairOutsideTheMatrix(t *testing.T) {
	e := newTestSvc(t)
	for _, pair := range [][2]string{
		{GroupHome, SlotSidebarLeft},
		{GroupCommon, SlotAside},
		{GroupBlogList, SlotAfterArticle},
		{GroupProductDetail, SlotSidebarLeft},
		{GroupBlogDetail, SlotAside},
		{GroupNotFound, "main"},
		{GroupBlogDetail, "sidebar"}, // the name this slot used to have
	} {
		_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), pair[0], pair[1], BlocksRequest{})
		cmstest.AssertFieldErr(t, err, "slot", "unknown")
	}
	require.Empty(t, e.repo.blocks, "a rejected pair stores nothing")
}

func TestRegions_ReplaceRejectsAnUnknownWidgetType(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotHeader,
		BlocksRequest{Blocks: []BlockInput{widgetBlock("weather_forecast", `{}`)}})
	cmstest.AssertFieldErr(t, err, "widget_type", "unknown")
}

func TestRegions_ReplaceRejectsAWidgetWithNoType(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotHeader,
		BlocksRequest{Blocks: []BlockInput{{Kind: KindWidget, IsVisible: true}}})
	cmstest.AssertFieldErr(t, err, "widget_type", "unknown")
}

// The config goes through the widget registry's own sanitizer rather than a
// second copy of its rules, so a scheme rejected in a page is rejected here.
func TestRegions_ReplaceRunsTheWidgetConfigThroughTheRegistry(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotFooter,
		BlocksRequest{Blocks: []BlockInput{widgetBlock(widgets.TypeCTABanner, `{"href":"javascript:alert(1)"}`)}})
	cmstest.AssertFieldErr(t, err, "config", "invalid_url")

	_, err = e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotFooter,
		BlocksRequest{Blocks: []BlockInput{widgetBlock(widgets.TypeRichText, `{"html":"<p>hi<script>x()</script></p>"}`)}})
	require.NoError(t, err)
	stored := e.repo.blocks[list(GroupCommon, SlotFooter)][0]
	require.NotContains(t, string(stored.Config), "<script>", "the stored config is the sanitized one")
}

func TestRegions_ReplaceRejectsAMenuBlockWithNoMenu(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupBlogDetail, SlotSidebarLeft,
		BlocksRequest{Blocks: []BlockInput{{Kind: KindMenu, IsVisible: true}}})
	cmstest.AssertFieldErr(t, err, "menu_id", "required")
}

func TestRegions_ReplaceRejectsAMenuThatDoesNotExist(t *testing.T) {
	e := newTestSvc(t)
	gone := uuid.New()
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupBlogDetail, SlotSidebarLeft,
		BlocksRequest{Blocks: []BlockInput{{Kind: KindMenu, MenuID: &gone, IsVisible: true}}})
	cmstest.AssertFieldErr(t, err, "menu_id", "not_found")
}

func TestRegions_ReplaceRejectsAnUnknownKind(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotHeader,
		BlocksRequest{Blocks: []BlockInput{{Kind: "banner", IsVisible: true}}})
	cmstest.AssertFieldErr(t, err, "kind", "unknown")
}

// A block is one thing or the other. The other kind's target is dropped on the
// way in, so switching a block's kind in the editor cannot leave a target
// behind for the database CHECK to reject.
func TestRegions_ReplaceKeepsOnlyTheKindsOwnTarget(t *testing.T) {
	e := newTestSvc(t)
	menuID := e.repo.withMenu()
	typ := widgets.TypeTeam
	_, err := e.svc.ReplaceRegionBlocks(context.Background(), cmstest.ActorWith(permManage), GroupCommon, SlotHeader,
		BlocksRequest{Blocks: []BlockInput{
			{Kind: KindWidget, WidgetType: &typ, MenuID: &menuID, Config: json.RawMessage(`{"limit":4}`), IsVisible: true},
			{Kind: KindMenu, MenuID: &menuID, WidgetType: &typ, Config: json.RawMessage(`{"limit":4}`), IsVisible: false},
		}})
	require.NoError(t, err)
	stored := e.repo.blocks[list(GroupCommon, SlotHeader)]
	require.Nil(t, stored[0].MenuID, "a widget block carries no menu")
	require.Equal(t, typ, *stored[0].WidgetType)
	require.Nil(t, stored[1].WidgetType, "a menu block carries no widget type")
	require.Equal(t, `{}`, string(stored[1].Config), "a menu block has no config of its own")
	require.False(t, stored[1].IsVisible)
}
