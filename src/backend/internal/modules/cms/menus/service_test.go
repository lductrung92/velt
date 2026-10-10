package menus

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestMenus_CreateAndLocationUnique(t *testing.T) {
	e := newTestSvc(t)
	m, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header", Location: "header"})
	require.NoError(t, err)
	require.Equal(t, "header", m.Location)
	_, err = e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header 2", Location: "header"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "location_already_exists")
}

func TestMenus_CreatePermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(), CreateRequest{Name: "X", Location: "x"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestMenus_GetNotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestMenus_UpdateRenameAndConflict(t *testing.T) {
	e := newTestSvc(t)
	a, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Header", Location: "header"})
	_, _ = e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "Footer", Location: "footer"})
	upd, err := e.svc.UpdateMenu(context.Background(), cmstest.ActorWith(permManage), a.ID, UpdateRequest{Name: cmstest.Strptr("Top")})
	require.NoError(t, err)
	require.Equal(t, "Top", upd.Name)
	_, err = e.svc.UpdateMenu(context.Background(), cmstest.ActorWith(permManage), a.ID, UpdateRequest{Location: cmstest.Strptr("footer")})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "location_already_exists")
}

func TestMenus_DeleteCascadesItems(t *testing.T) {
	e := newTestSvc(t)
	m, _ := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	_, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID,
		ItemsRequest{Items: []ItemInput{{Label: "Home", LinkType: LinkInternal, URL: cmstest.Strptr("/")}}})
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
	res, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID, req)
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
			_, err := e.svc.ReplaceMenuItems(context.Background(), act, m.ID, ItemsRequest{Items: []ItemInput{c.item}})
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
	tree := buildItemTree(rows)
	require.Len(t, tree, 2) // real root + promoted orphan
	require.Equal(t, "Root", tree[0].Label)
	require.Len(t, tree[0].Children, 1)
	require.Equal(t, "Child", tree[0].Children[0].Label)
	require.Equal(t, "Orphan", tree[1].Label)
	require.Empty(t, tree[1].Children)
}
