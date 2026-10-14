package pages

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestListPages_RequiresViewPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(), PageListParams{})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestListPages_Tree(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("About", "about", nil, PageStatusPublished)
	e.repo.seedPage("Team", "team", &root.ID, PageStatusDraft)
	tree, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView), PageListParams{})
	require.NoError(t, err)
	require.Len(t, tree, 1)
	require.Equal(t, root.ID, tree[0].ID)
	require.Len(t, tree[0].Children, 1)
	require.Equal(t, "team", tree[0].Children[0].Slug)
}

func TestGetPage_NotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.GetPage(context.Background(), cmstest.SuperActor(), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestCreatePage_DerivesSlugAndDraft(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreatePage(context.Background(), cmstest.ActorWith(permCreate), CreatePageRequest{Title: "Về Chúng Tôi"})
	require.NoError(t, err)
	require.Equal(t, "ve-chung-toi", res.Slug)
	require.Equal(t, PageStatusDraft, res.Status)
}

func TestCreatePage_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreatePage(context.Background(), cmstest.ActorWith(permView), CreatePageRequest{Title: "X"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestCreatePage_SlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedPage("About", "about", nil, PageStatusDraft)
	_, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "About"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestCreatePage_AutoSuffixWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedPage("About", "about", nil, PageStatusDraft)
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "About"})
	require.NoError(t, err)
	require.Equal(t, "about-01", res.Slug)
}

func TestCreatePage_AutoSuffixSkipsTakenSuffixes(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedPage("About", "about", nil, PageStatusDraft)
	e.repo.seedPage("About 1", "about-01", nil, PageStatusDraft)
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "About"})
	require.NoError(t, err)
	require.Equal(t, "about-02", res.Slug)
}

// Auto-suffix is scoped per parent: the same slug is free under a different
// parent (sibling-uniqueness, not global).
func TestCreatePage_AutoSuffixScopedPerParent(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	parent := e.repo.seedPage("Docs", "docs", nil, PageStatusDraft)
	e.repo.seedPage("About", "about", nil, PageStatusDraft) // root-level "about" taken
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(),
		CreatePageRequest{Title: "About", ParentID: &parent.ID})
	require.NoError(t, err)
	require.Equal(t, "about", res.Slug) // free under a different parent
}

func TestCreatePage_ParentNotFound(t *testing.T) {
	e := newTestSvc(t)
	missing := uuid.New()
	_, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "Child", ParentID: &missing})
	cmstest.AssertFieldErr(t, err, "parent_id", "not_found")
}

func TestCreatePage_UnsluggableTitle(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "!!!"})
	cmstest.AssertFieldErr(t, err, "slug", "invalid_slug")
}

func TestCreatePage_SanitizesBody(t *testing.T) {
	e := newTestSvc(t)
	body := `<p>Hi</p><script>alert(1)</script><a href="javascript:evil()">x</a>`
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "P", BodyHTML: &body})
	require.NoError(t, err)
	require.NotNil(t, res.BodyHTML)
	require.NotContains(t, *res.BodyHTML, "<script")
	require.NotContains(t, *res.BodyHTML, "javascript:")
	require.Contains(t, *res.BodyHTML, "<p>Hi</p>")
}

func TestUpdatePage_MoveToSelfCycle(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	_, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), p.ID,
		UpdatePageRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: &p.ID}, UpdatedAt: &p.UpdatedAt})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "page_cycle")
}

func TestUpdatePage_MoveUnderDescendantCycle(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("Root", "root", nil, PageStatusDraft)
	child := e.repo.seedPage("Child", "child", &root.ID, PageStatusDraft)
	_, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), root.ID,
		UpdatePageRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: &child.ID}, UpdatedAt: &root.UpdatedAt})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "page_cycle")
}

func TestUpdatePage_MoveToRoot(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("Root", "root", nil, PageStatusDraft)
	child := e.repo.seedPage("Child", "child", &root.ID, PageStatusDraft)
	res, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), child.ID,
		UpdatePageRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: nil}, UpdatedAt: &child.UpdatedAt})
	require.NoError(t, err)
	require.Nil(t, res.ParentID)
}

func TestUpdatePage_RegenerateSlugWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	p := e.repo.seedPage("About", "old", nil, PageStatusDraft)
	res, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), p.ID,
		UpdatePageRequest{Title: cmstest.Strptr("About Us"), RegenerateSlug: true, UpdatedAt: &p.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "about-us", res.Slug)
}

func TestUpdatePage_OptimisticLockConflict(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	stale := p.UpdatedAt.Add(-1)
	_, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), p.ID,
		UpdatePageRequest{Title: cmstest.Strptr("B"), UpdatedAt: &stale})
	cmstest.AssertAppErr(t, err, http.StatusConflict, "conflict")
	res, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), p.ID,
		UpdatePageRequest{Title: cmstest.Strptr("B"), UpdatedAt: &p.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "B", res.Title)
}

func TestUpdatePage_SEOReplaceAll(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	// Seed all 8 SEO fields, then PATCH with only Title set → whole SEO block is
	// replaced (not merged): the other 7 fields must reset to zero.
	p.SEOTitle = cmstest.Strptr("old title")
	p.SEODescription = cmstest.Strptr("old desc")
	p.SEOKeywords = cmstest.Strptr("old kw")
	p.CanonicalURL = cmstest.Strptr("https://old.example.com")
	p.SEONoindex = true
	p.SEONofollow = true
	p.OGTitle = cmstest.Strptr("old og title")
	p.OGDescription = cmstest.Strptr("old og desc")
	res, err := e.svc.UpdatePage(context.Background(), cmstest.SuperActor(), p.ID,
		UpdatePageRequest{SEO: &shared.PageSEO{Title: cmstest.Strptr("New SEO")}, UpdatedAt: &p.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "New SEO", *res.SEO.Title)
	require.Nil(t, res.SEO.Description)   // wiped
	require.Nil(t, res.SEO.Keywords)      // wiped
	require.Nil(t, res.SEO.CanonicalURL)  // wiped
	require.False(t, res.SEO.NoIndex)     // reset
	require.False(t, res.SEO.NoFollow)    // reset
	require.Nil(t, res.SEO.OGTitle)       // wiped
	require.Nil(t, res.SEO.OGDescription) // wiped
}

func TestDeletePage_HasChildren(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("Root", "root", nil, PageStatusDraft)
	e.repo.seedPage("Child", "child", &root.ID, PageStatusDraft)
	err := e.svc.DeletePage(context.Background(), cmstest.SuperActor(), root.ID)
	cmstest.AssertAppErr(t, err, http.StatusConflict, "page_has_children")
}

func TestDeletePage_Success(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	require.NoError(t, e.svc.DeletePage(context.Background(), cmstest.SuperActor(), p.ID))
	_, ok := e.repo.pages[p.ID]
	require.False(t, ok)
}

func TestDeletePage_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	err := e.svc.DeletePage(context.Background(), cmstest.ActorWith(permView), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestPublishPage_SuccessWithSnapshot(t *testing.T) {
	e := newTestSvc(t)
	body := "<p>Body</p>"
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	p.BodyHTML = &body
	res, err := e.svc.PublishPage(context.Background(), cmstest.ActorWith(permPublish), p.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusPublished, res.Status)
	require.NotNil(t, res.PublishedAt)
	require.NotNil(t, res.PublishedSnapshot)
	var snap pageSnapshot
	require.NoError(t, json.Unmarshal(res.PublishedSnapshot, &snap))
	require.Equal(t, "a", snap.Slug)
	require.Equal(t, "<p>Body</p>", *snap.BodyHTML)
}

func TestPublishPage_FromArchived(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusArchived)
	res, err := e.svc.PublishPage(context.Background(), cmstest.SuperActor(), p.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusPublished, res.Status)
}

func TestPublishPage_AlreadyPublished(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusPublished)
	_, err := e.svc.PublishPage(context.Background(), cmstest.SuperActor(), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestPublishPage_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	_, err := e.svc.PublishPage(context.Background(), cmstest.ActorWith(permEdit), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestUnpublishPage_Success(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusPublished)
	res, err := e.svc.UnpublishPage(context.Background(), cmstest.SuperActor(), p.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusArchived, res.Status)
}

func TestUnpublishPage_NotPublished(t *testing.T) {
	e := newTestSvc(t)
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)
	_, err := e.svc.UnpublishPage(context.Background(), cmstest.SuperActor(), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestUnauthenticatedPages(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListPages(context.Background(), nil, PageListParams{})
	cmstest.AssertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

// --- landing-attached lifecycle (kind=landing, cascade) ---

func TestCreatePage_LandingKind_CreatesAndAttaches(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(),
		CreatePageRequest{Title: "Trang chủ", Kind: PageKindLanding})
	require.NoError(t, err)
	require.NotNil(t, res.LandingID)
	require.Equal(t, e.landing.nextID, *res.LandingID)
	require.Equal(t, []string{"Trang chủ|trang-chu"}, e.landing.created) // name=title, key=slug base
}

func TestCreatePage_ContentKind_NoLanding(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(), CreatePageRequest{Title: "About"})
	require.NoError(t, err)
	require.Nil(t, res.LandingID)
	require.Empty(t, e.landing.created)
}

// A failed page insert must roll back the just-created landing (no orphan design).
func TestCreatePage_LandingKind_RollbackOnSlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedPage("About", "about", nil, PageStatusDraft)
	_, err := e.svc.CreatePage(context.Background(), cmstest.SuperActor(),
		CreatePageRequest{Title: "About", Kind: PageKindLanding}) // manual-edit ON (super) → conflict
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
	require.Len(t, e.landing.created, 1)
	require.Equal(t, []uuid.UUID{e.landing.nextID}, e.landing.deleted) // rolled back
}

func TestDeletePage_CascadesAttachedLanding(t *testing.T) {
	e := newTestSvc(t)
	lid := uuid.New()
	p := e.repo.seedPage("L", "l", nil, PageStatusDraft)
	p.LandingID = &lid
	require.NoError(t, e.svc.DeletePage(context.Background(), cmstest.SuperActor(), p.ID))
	require.Equal(t, []uuid.UUID{lid}, e.landing.deleted)
}

func TestPublishPage_PublishesAttachedLandingFirst(t *testing.T) {
	e := newTestSvc(t)
	lid := uuid.New()
	p := e.repo.seedPage("L", "l", nil, PageStatusDraft)
	p.LandingID = &lid
	res, err := e.svc.PublishPage(context.Background(), cmstest.ActorWith(permPublish), p.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusPublished, res.Status)
	require.Equal(t, []uuid.UUID{lid}, e.landing.published) // one publish button drives both
}

// A landing publish failure aborts the page publish (never a published page
// pointing at an unpublished design).
func TestPublishPage_AbortsWhenLandingPublishFails(t *testing.T) {
	e := newTestSvc(t)
	lid := uuid.New()
	p := e.repo.seedPage("L", "l", nil, PageStatusDraft)
	p.LandingID = &lid
	e.landing.publishErr = context.DeadlineExceeded
	_, err := e.svc.PublishPage(context.Background(), cmstest.ActorWith(permPublish), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusInternalServerError, "internal_server_error")
	require.Equal(t, PageStatusDraft, e.repo.pages[p.ID].Status, "page publish aborted")
}

func TestUnpublishPage_UnpublishesAttachedLanding(t *testing.T) {
	e := newTestSvc(t)
	lid := uuid.New()
	p := e.repo.seedPage("L", "l", nil, PageStatusPublished)
	p.LandingID = &lid
	_, err := e.svc.UnpublishPage(context.Background(), cmstest.SuperActor(), p.ID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{lid}, e.landing.unpublished)
}
