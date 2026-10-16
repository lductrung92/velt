package menus

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// A location holds as many menus as the editor wants: the second header is how
// a replacement is prepared before it goes live.
func TestMenus_CreateSharesALocation(t *testing.T) {
	e := newTestSvc(t)
	m, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header", Location: "header"})
	require.NoError(t, err)
	require.Equal(t, "header", m.Location)
	second, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header 2", Location: "header"})
	require.NoError(t, err)
	require.Equal(t, "header", second.Location)
	require.NotEqual(t, m.ID, second.ID)
}

func TestMenus_CreatePermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(), CreateRequest{Name: "X", Location: "x"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestMenus_GetNotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), uuid.New(), "")
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestMenus_UpdateRenameAndMoveOntoAnOccupiedLocation(t *testing.T) {
	e := newTestSvc(t)
	a, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header", Location: "header"})
	_, _ = e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Footer", Location: "footer"})
	upd, err := e.svc.UpdateMenu(context.Background(), cmstest.ActorWith(permManage), a.ID, UpdateRequest{Name: cmstest.Strptr("Top")})
	require.NoError(t, err)
	require.Equal(t, "Top", upd.Name)
	moved, err := e.svc.UpdateMenu(context.Background(), cmstest.ActorWith(permManage), a.ID, UpdateRequest{Location: cmstest.Strptr("footer")})
	require.NoError(t, err, "a menu may move onto a location another menu already occupies")
	require.Equal(t, "footer", moved.Location)
}

func TestMenus_DeleteCascadesItems(t *testing.T) {
	e := newTestSvc(t)
	m, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	_, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID,
		ItemsRequest{Items: []ItemInput{{Label: "Home", LinkType: LinkInternal, URL: cmstest.Strptr("/")}}}, "")
	require.NoError(t, err)
	require.NoError(t, e.svc.DeleteMenu(context.Background(), cmstest.ActorWith(permManage), m.ID))
	_, ok := e.repo.menuItems[m.ID]
	require.False(t, ok)
}

func TestMenus_ReplaceItemsTreeRoundTrips(t *testing.T) {
	e := newTestSvc(t)
	m, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	art := uuid.New()
	req := ItemsRequest{Items: []ItemInput{
		{Label: "Home", LinkType: LinkInternal, URL: cmstest.Strptr("/")},
		{Label: "Blog", LinkType: LinkArticle, TargetID: &art, Children: []ItemInput{
			{Label: "Ext", LinkType: LinkExternal, URL: cmstest.Strptr("https://example.com"), OpenNewTab: true},
		}},
	}}
	res, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID, req, "")
	require.NoError(t, err)
	require.Len(t, res.Items, 2)
	require.Equal(t, "Home", res.Items[0].Label)
	require.Equal(t, LinkArticle, res.Items[1].LinkType)
	require.Len(t, res.Items[1].Children, 1)
	require.Equal(t, "Ext", res.Items[1].Children[0].Label)
	require.True(t, res.Items[1].Children[0].OpenNewTab)
	require.NotNil(t, res.Items[1].TargetID)
	require.Nil(t, res.Items[1].URL)
}

func TestMenus_ReplaceItemsRejectsBadLinks(t *testing.T) {
	e := newTestSvc(t)
	m, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	act := cmstest.ActorWith(permManage)
	cases := []struct {
		name  string
		item  ItemInput
		field string
		key   string
	}{
		{"external loopback", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://127.0.0.1/x")}, "url", "host_not_allowed"},
		{"external localhost", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://localhost:8080")}, "url", "host_not_allowed"},
		{"external private", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("https://10.0.0.5/admin")}, "url", "host_not_allowed"},
		{"external decimal-ip", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://2130706433/")}, "url", "host_not_allowed"},
		{"external octal-ip", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://0177.0.0.1/")}, "url", "host_not_allowed"},
		{"external ipv4-mapped-ipv6", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://[::ffff:127.0.0.1]/")}, "url", "host_not_allowed"},
		{"external metadata host", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://metadata.google.internal/")}, "url", "host_not_allowed"},
		{"external internal suffix", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://db.internal/")}, "url", "host_not_allowed"},
		{"external bad scheme", ItemInput{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("javascript:alert(1)")}, "url", "invalid_url"},
		{"external missing url", ItemInput{Label: "x", LinkType: LinkExternal}, "url", "required"},
		{"internal not relative", ItemInput{Label: "x", LinkType: LinkInternal, URL: cmstest.Strptr("https://evil.com")}, "url", "invalid_internal_url"},
		{"article missing target", ItemInput{Label: "x", LinkType: LinkArticle}, "target_id", "required"},
		// validateItems must recurse: a bad link nested under a valid parent is rejected.
		{"nested external loopback", ItemInput{Label: "parent", LinkType: LinkInternal, URL: cmstest.Strptr("/"), Children: []ItemInput{
			{Label: "x", LinkType: LinkExternal, URL: cmstest.Strptr("http://127.0.0.1/x")},
		}}, "url", "host_not_allowed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := e.svc.ReplaceMenuItems(context.Background(), act, m.ID, ItemsRequest{Items: []ItemInput{c.item}}, "")
			cmstest.AssertFieldErr(t, err, c.field, c.key)
		})
	}
}

func TestMenus_ListRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListMenus(context.Background(), cmstest.ActorWith())
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

// buildItemTree nests children under their parent and promotes any row whose
// parent_id is absent from the set to a root (instead of dropping it).
func TestBuildItemTree_NestsAndPromotesOrphans(t *testing.T) {
	root := uuid.New()
	child := uuid.New()
	missing := uuid.New()
	orphan := uuid.New()
	rows := []itemRow{
		{ID: root, Label: "Root", LinkType: LinkInternal, SortOrder: 0},
		{ID: child, ParentID: &root, Label: "Child", LinkType: LinkInternal, SortOrder: 0},
		{ID: orphan, ParentID: &missing, Label: "Orphan", LinkType: LinkInternal, SortOrder: 1},
	}
	tree := buildItemTree(rows, nil)
	require.Len(t, tree, 2) // real root + promoted orphan
	require.Equal(t, "Root", tree[0].Label)
	require.Len(t, tree[0].Children, 1)
	require.Equal(t, "Child", tree[0].Children[0].Label)
	require.Equal(t, "Orphan", tree[1].Label)
	require.Empty(t, tree[1].Children)
}

// publicLabels flattens one slot's root labels, in the order the site gets them.
func publicLabels(items []PublicItem) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.Label)
	}
	return out
}

// Several menus may share a location, but the public response has one entry per
// location: the oldest menu is rendered and the rest are ignored. The choice
// must not depend on the order the query happened to return the rows in, or the
// site would flip between menus between reads. See oldestMenu.
func TestMenusByLocation_OldestMenuAtALocationWins(t *testing.T) {
	born := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	live, draft := uuid.New(), uuid.New()
	row := func(menu uuid.UUID, created time.Time, label string) publicRow {
		return publicRow{
			itemRow:       itemRow{ID: uuid.New(), Label: label, LinkType: LinkInternal, URL: cmstest.Strptr("/")},
			Location:      "header",
			MenuID:        menu,
			MenuCreatedAt: created,
		}
	}
	home := row(live, born, "Home")
	blog := row(live, born, "Blog")
	replacement := row(draft, born.Add(time.Hour), "Replacement")

	for name, rows := range map[string][]publicRow{
		"replacement first":   {replacement, home, blog},
		"replacement between": {home, replacement, blog},
		"replacement last":    {home, blog, replacement},
	} {
		t.Run(name, func(t *testing.T) {
			out := menusByLocation(rows)
			require.Len(t, out, 1)
			require.Equal(t, []string{"Home", "Blog"}, publicLabels(out["header"]))
		})
	}
}

// Two menus created in the same instant still have to resolve to one of them.
func TestMenusByLocation_SameInstantBreaksTheTieOnID(t *testing.T) {
	born := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	a := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	b := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	row := func(menu uuid.UUID, label string) publicRow {
		return publicRow{
			itemRow:       itemRow{ID: uuid.New(), Label: label, LinkType: LinkInternal, URL: cmstest.Strptr("/")},
			Location:      "footer",
			MenuID:        menu,
			MenuCreatedAt: born,
		}
	}
	first, second := row(a, "First"), row(b, "Second")
	require.Equal(t, []string{"First"}, publicLabels(menusByLocation([]publicRow{first, second})["footer"]))
	require.Equal(t, []string{"First"}, publicLabels(menusByLocation([]publicRow{second, first})["footer"]))
}
