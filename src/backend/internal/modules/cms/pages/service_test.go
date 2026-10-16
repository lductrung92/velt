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

// Every page is a row of its own. A page that happens to carry a parent_id from
// before — the column is still there — is listed like any other, because the
// relationship meant nothing to a reader: a page's address is one slug segment.
func TestListPages_IsFlat(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("About", "about", nil, PageStatusPublished)
	e.repo.seedPage("Team", "team", &root.ID, PageStatusDraft)
	res, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView), PageListParams{})
	require.NoError(t, err)
	require.Equal(t, 2, res.Total)
	require.Len(t, res.Items, 2)
	slugs := []string{res.Items[0].Slug, res.Items[1].Slug}
	require.ElementsMatch(t, []string{"about", "team"}, slugs)
}

func TestListPages_FiltersAndPages(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedPage("About", "about", nil, PageStatusPublished)
	e.repo.seedPage("Team", "team", nil, PageStatusDraft)
	e.repo.seedPage("Jobs", "jobs", nil, PageStatusDraft)
	actor := cmstest.ActorWith(permView)

	only, err := e.svc.ListPages(context.Background(), actor, PageListParams{Status: PageStatusDraft})
	require.NoError(t, err)
	require.Equal(t, 2, only.Total)

	found, err := e.svc.ListPages(context.Background(), actor, PageListParams{Query: "abo"})
	require.NoError(t, err)
	require.Equal(t, 1, found.Total)
	require.Equal(t, "about", found.Items[0].Slug)

	// A page of two of three still reports three: the pager counts matches, not
	// what fits on screen.
	first, err := e.svc.ListPages(context.Background(), actor, PageListParams{Page: 1, PageSize: 2})
	require.NoError(t, err)
	require.Len(t, first.Items, 2)
	require.Equal(t, 3, first.Total)
	require.Equal(t, 2, first.PageSize)
}

func TestListPages_RejectsAnUnknownStatus(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView),
		PageListParams{Status: "nope"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestListPageOptions_ReturnsEveryPage(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedPage("About", "about", nil, PageStatusPublished)
	e.repo.seedPage("Team", "team", nil, PageStatusDraft)
	// A picker must not stop at a page boundary, or it hides a page somebody
	// is looking for.
	opts, err := e.svc.ListPageOptions(context.Background(), cmstest.ActorWith(permView), "")
	require.NoError(t, err)
	require.Len(t, opts, 2)
}

// --- Reading a list in the console's language ---

// titlesBySlug flattens a page list so a test can name a row without depending
// on the order the fake repository happens to return.
func titlesBySlug(items []PageListItem) map[string]string {
	out := make(map[string]string, len(items))
	for _, it := range items {
		out[it.Slug] = it.Title
	}
	return out
}

// A page with an English title shows it; the one beside it that nobody has
// translated keeps the Vietnamese the author wrote.
func TestListPages_ShowsTheEnglishTitleWhereThereIsOne(t *testing.T) {
	e := newTestSvc(t)
	about := e.repo.seedPage("Gioi thieu", "gioi-thieu", nil, PageStatusPublished)
	e.repo.seedPage("Lien he", "lien-he", nil, PageStatusDraft)
	e.svc.SetTranslator(&fakeTranslator{values: map[uuid.UUID]map[string]map[string]any{
		about.ID: {"en": {"title": "About us"}},
	}})

	res, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView), PageListParams{Locale: "en"})
	require.NoError(t, err)
	require.Equal(t, map[string]string{"gioi-thieu": "About us", "lien-he": "Lien he"}, titlesBySlug(res.Items))
}

// A blank translation is somebody who opened the form and did not finish it,
// not a page without a title.
func TestListPages_BlankTranslationFallsBackToTheRow(t *testing.T) {
	e := newTestSvc(t)
	about := e.repo.seedPage("Gioi thieu", "gioi-thieu", nil, PageStatusPublished)
	e.svc.SetTranslator(&fakeTranslator{values: map[uuid.UUID]map[string]map[string]any{
		about.ID: {"en": {"title": ""}},
	}})

	res, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView), PageListParams{Locale: "en"})
	require.NoError(t, err)
	require.Equal(t, "Gioi thieu", res.Items[0].Title)
}

// Reading in the source language must not cost a query.
func TestListPages_SourceLanguageLooksUpNothing(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedPage("Gioi thieu", "gioi-thieu", nil, PageStatusPublished)
	tr := &fakeTranslator{}
	e.svc.SetTranslator(tr)

	for _, locale := range []string{"vi", ""} {
		res, err := e.svc.ListPages(context.Background(), cmstest.ActorWith(permView), PageListParams{Locale: locale})
		require.NoError(t, err)
		require.Equal(t, "Gioi thieu", res.Items[0].Title)
	}
	require.Zero(t, tr.bundled)
}

func TestListPageOptions_ShowsTheEnglishTitleWhereThereIsOne(t *testing.T) {
	e := newTestSvc(t)
	about := e.repo.seedPage("Gioi thieu", "gioi-thieu", nil, PageStatusPublished)
	e.repo.seedPage("Lien he", "lien-he", nil, PageStatusDraft)
	tr := &fakeTranslator{values: map[uuid.UUID]map[string]map[string]any{
		about.ID: {"en": {"title": "About us"}},
	}}
	e.svc.SetTranslator(tr)

	opts, err := e.svc.ListPageOptions(context.Background(), cmstest.ActorWith(permView), "en")
	require.NoError(t, err)
	got := map[string]string{}
	for _, o := range opts {
		got[o.Slug] = o.Title
	}
	require.Equal(t, map[string]string{"gioi-thieu": "About us", "lien-he": "Lien he"}, got)
	require.Equal(t, 1, tr.bundled) // one bulk read for the whole picker
}

// The editor must keep showing the page's own columns: hand it a translated
// title and the next save writes English into the Vietnamese row. GetPage
// therefore takes no locale at all, and wiring a translator changes nothing.
func TestGetPage_IsNeverTranslated(t *testing.T) {
	e := newTestSvc(t)
	about := e.repo.seedPage("Gioi thieu", "gioi-thieu", nil, PageStatusPublished)
	tr := &fakeTranslator{values: map[uuid.UUID]map[string]map[string]any{
		about.ID: {"en": {"title": "About us"}},
	}}
	e.svc.SetTranslator(tr)

	got, err := e.svc.GetPage(context.Background(), cmstest.ActorWith(permView), about.ID)
	require.NoError(t, err)
	require.Equal(t, "Gioi thieu", got.Title)
	require.Zero(t, tr.bundled)
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

// A page that still points at another one is a leftover of a hierarchy nothing
// can edit any more, so deleting the page it points at detaches it rather than
// refusing — otherwise both pages would be stuck for good.
func TestDeletePage_DetachesALeftoverChild(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedPage("Root", "root", nil, PageStatusDraft)
	child := e.repo.seedPage("Child", "child", &root.ID, PageStatusDraft)
	require.NoError(t, e.svc.DeletePage(context.Background(), cmstest.SuperActor(), root.ID))
	require.Nil(t, e.repo.pages[child.ID].ParentID)
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
