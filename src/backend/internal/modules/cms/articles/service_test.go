package articles

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// editorActor: own-only (no review) → editor status-set + ABAC.
func editorActor(uid uuid.UUID) *httpx.Identity {
	return &httpx.Identity{UserID: uid, Permissions: []string{permView, permCreate, permEdit, permDelete}}
}

// reviewerActor: has review → admin-class, sees all.
func reviewerActor() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView, permCreate, permEdit, permDelete, permReview}}
}

func TestArticles_CreateDraftAndDeriveSlug(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	a := editorActor(uuid.New())
	res, err := e.svc.CreateArticle(context.Background(), a, CreateArticleRequest{Title: "Bài Viết Đầu"})
	require.NoError(t, err)
	require.Equal(t, "bai-viet-dau", res.Slug)
	require.Equal(t, ArticleStatusDraft, res.Status)
	require.Equal(t, a.UserID, res.Author.ID)
}

func TestArticles_CreatePermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateArticle(context.Background(), cmstest.ActorWith(permView), CreateArticleRequest{Title: "X"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestArticles_CreateSanitizesBody(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	body := `<p>Ok</p><script>x()</script>`
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "P", BodyHTML: &body})
	require.NoError(t, err)
	require.NotContains(t, *res.BodyHTML, "<script")
	require.Contains(t, *res.BodyHTML, "<p>Ok</p>")
}

func TestArticles_CategorizeRequiredByDefault(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "X"})
	cmstest.AssertFieldErr(t, err, "category_id", "required")
}

func TestArticles_CreateCategoryNotFound(t *testing.T) {
	e := newTestSvc(t)
	cat := uuid.New()
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "X", CategoryID: &cat})
	cmstest.AssertFieldErr(t, err, "category_id", "not_found")
}

func TestArticles_CreateTagNotFound(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "X", TagIDs: []uuid.UUID{uuid.New()}})
	cmstest.AssertFieldErr(t, err, "tag_ids", "not_found")
}

func TestArticles_CreateWithTags(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	tg := e.repo.seedTag("Go", "go")
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "X", TagIDs: []uuid.UUID{tg.ID}})
	require.NoError(t, err)
	require.Len(t, res.Tags, 1)
	require.Equal(t, "go", res.Tags[0].Slug)
}

func TestArticles_AutoSuffixWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagArticleAllowSlugEdit: false})
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "Hello"})
	require.NoError(t, err)
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(), CreateArticleRequest{Title: "Hello"})
	require.NoError(t, err)
	require.Equal(t, "hello-01", res.Slug)
}

func TestArticles_AdminCreatePublishedWritesSnapshot(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(),
		CreateArticleRequest{Title: "Pub", Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, res.Status)
	require.NotNil(t, res.PublishedSnapshot)
	var snap articleSnapshot
	require.NoError(t, json.Unmarshal(res.PublishedSnapshot, &snap))
	require.Equal(t, "pub", snap.Slug)
}

func TestArticles_EditorCannotCreatePublishedWhenReviewOn(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	_, err := e.svc.CreateArticle(context.Background(), editorActor(uuid.New()),
		CreateArticleRequest{Title: "X", Status: cmstest.Strptr(ArticleStatusPublished)})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestArticles_EditorCreatePendingReview(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	res, err := e.svc.CreateArticle(context.Background(), editorActor(uuid.New()),
		CreateArticleRequest{Title: "X", Status: cmstest.Strptr(ArticleStatusPendingReview)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPendingReview, res.Status)
}

func TestArticles_EditorCanPublishWhenReviewOff(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagArticleRequireReview: false})
	res, err := e.svc.CreateArticle(context.Background(), editorActor(uuid.New()),
		CreateArticleRequest{Title: "X", Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, res.Status)
}

func TestArticles_ScheduledOnlyWhenAllowNowOff(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	future := time.Now().Add(48 * time.Hour)
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(),
		CreateArticleRequest{Title: "X", Status: cmstest.Strptr(ArticleStatusScheduled), PublishAt: &future})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")

	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagPublishAllowNow: false})
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(),
		CreateArticleRequest{Title: "Y", Status: cmstest.Strptr(ArticleStatusScheduled), PublishAt: &future})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusScheduled, res.Status)
}

func TestArticles_ScheduledNeedsFuturePublishAt(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagPublishAllowNow: false})
	_, err := e.svc.CreateArticle(context.Background(), reviewerActor(),
		CreateArticleRequest{Title: "X", Status: cmstest.Strptr(ArticleStatusScheduled)})
	cmstest.AssertFieldErr(t, err, "publish_at", "required")
}

func TestArticles_AllowNowOffStillPublishesNow(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false, shared.FlagPublishAllowNow: false})
	res, err := e.svc.CreateArticle(context.Background(), reviewerActor(),
		CreateArticleRequest{Title: "Now", Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, res.Status)
}

func TestArticles_GetABAC_OthersAre404(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("Owned", "owned", owner, ArticleStatusDraft)
	_, err := e.svc.GetArticle(context.Background(), editorActor(uuid.New()), art.ID)
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
	_, err = e.svc.GetArticle(context.Background(), editorActor(owner), art.ID)
	require.NoError(t, err)
	_, err = e.svc.GetArticle(context.Background(), reviewerActor(), art.ID)
	require.NoError(t, err)
}

func TestArticles_ListEditorScopedToOwn(t *testing.T) {
	e := newTestSvc(t)
	me := uuid.New()
	e.repo.seedArticle("Mine", "mine", me, ArticleStatusDraft)
	e.repo.seedArticle("Theirs", "theirs", uuid.New(), ArticleStatusDraft)
	res, err := e.svc.ListArticles(context.Background(), editorActor(me), ArticleListParams{})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Equal(t, "mine", res.Items[0].Slug)
	all, err := e.svc.ListArticles(context.Background(), reviewerActor(), ArticleListParams{})
	require.NoError(t, err)
	require.Equal(t, 2, all.Total)
}

func TestArticles_ListInvalidStatusRejected(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListArticles(context.Background(), reviewerActor(), ArticleListParams{Status: "bogus"})
	cmstest.AssertFieldErr(t, err, "status", "invalid_value")
}

func TestArticles_UpdateOptimisticLock(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	stale := art.UpdatedAt.Add(-time.Hour)
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &stale, Title: cmstest.Strptr("B")})
	cmstest.AssertAppErr(t, err, http.StatusConflict, "conflict")
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Title: cmstest.Strptr("B")})
	require.NoError(t, err)
	require.Equal(t, "B", res.Title)
}

func TestArticles_UpdateSEOReplaceAll(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	art.SEODescription = cmstest.Strptr("old desc")
	art.SEONoindex = true
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, SEO: &shared.PageSEO{Title: cmstest.Strptr("New")}})
	require.NoError(t, err)
	require.Equal(t, "New", *res.SEO.Title)
	require.Nil(t, res.SEO.Description)
	require.False(t, res.SEO.NoIndex)
}

func TestArticles_EditorReadOnlyWhenPublished(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusPublished)
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Title: cmstest.Strptr("B")})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestArticles_EditorSubmit(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusPendingReview)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPendingReview, res.Status)
}

func TestArticles_EditorCannotPublishOwn(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusPublished)})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestArticles_AdminApprovesEditorArticle(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusPendingReview)
	res, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, res.Status)
	require.NotNil(t, res.PublishedSnapshot)
}

func TestArticles_AdminReturnsNeedsRevisionRequiresNote(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusPendingReview)
	_, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusNeedsRevision)})
	cmstest.AssertFieldErr(t, err, "note", "required")
	res, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusNeedsRevision), Note: cmstest.Strptr("fix intro")})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusNeedsRevision, res.Status)
	require.NotNil(t, res.ReviewNote)
	require.Equal(t, "fix intro", *res.ReviewNote)
}

func TestArticles_AdminAuthoredHasNoReviewStates(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusDraft)
	art.AuthorRole = "admin"
	_, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusNeedsRevision), Note: cmstest.Strptr("x")})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
}

func TestArticles_EditorEditsOwnNeedsRevision(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusNeedsRevision)
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Title: cmstest.Strptr("Fixed")})
	require.NoError(t, err)
	require.Equal(t, "Fixed", res.Title)
	require.Equal(t, ArticleStatusNeedsRevision, res.Status)
}

func TestArticles_AdminUnpublishAndRepublish(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusPublished)
	res, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusArchived)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusArchived, res.Status)
	res, err = e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &res.UpdatedAt, Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)
	require.Equal(t, ArticleStatusPublished, res.Status)
	require.NotNil(t, res.PublishedSnapshot)
}

func TestArticles_EditorEditsOwnPublishedWhenReviewOff(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleRequireReview: false, shared.FlagArticleCategorize: false})
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusPublished)
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Title: cmstest.Strptr("B")})
	require.NoError(t, err)
	require.Equal(t, "B", res.Title)
	require.Equal(t, ArticleStatusPublished, res.Status)
}

func TestArticles_CannotClearCategoryWhenCategorizeOn(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	cat := uuid.New()
	art.CategoryID = &cat
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, CategoryID: shared.Optional[uuid.UUID]{Set: true, Value: nil}})
	cmstest.AssertFieldErr(t, err, "category_id", "required")
}

func TestArticles_CanClearCategoryWhenCategorizeOff(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	cat := uuid.New()
	art.CategoryID = &cat
	res, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, CategoryID: shared.Optional[uuid.UUID]{Set: true, Value: nil}})
	require.NoError(t, err)
	require.Nil(t, res.Category)
}

func TestArticles_SlugConflictWhenManualEditOn(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	r := reviewerActor()
	_, err := e.svc.CreateArticle(context.Background(), r, CreateArticleRequest{Title: "Hello", Slug: cmstest.Strptr("dup")})
	require.NoError(t, err)
	_, err = e.svc.CreateArticle(context.Background(), r, CreateArticleRequest{Title: "Hello 2", Slug: cmstest.Strptr("dup")})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestArticles_DeleteEditorOnlyDraft(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	pub := e.repo.seedArticle("Pub", "pub", owner, ArticleStatusPublished)
	err := e.svc.DeleteArticle(context.Background(), editorActor(owner), pub.ID)
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "invalid_status_transition")
	dr := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	require.NoError(t, e.svc.DeleteArticle(context.Background(), editorActor(owner), dr.ID))
}

// Deleting an article reclaims its whole media folder (no orphaned files).
func TestArticles_DeletePurgesMediaFolder(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	base := "cms/articles/" + art.ID.String() + "/"
	e.store.Saved[base+"featured-x.png"] = []byte("x")
	e.store.Saved[base+"og-y.png"] = []byte("x")
	e.store.Saved["cms/articles/other/keep.png"] = []byte("x") // another article

	require.NoError(t, e.svc.DeleteArticle(context.Background(), editorActor(owner), art.ID))

	require.NotContains(t, e.store.Saved, base+"featured-x.png")
	require.NotContains(t, e.store.Saved, base+"og-y.png")
	require.Contains(t, e.store.Saved, "cms/articles/other/keep.png")
}

// Updating the body reclaims inline images no longer referenced (removed/replaced,
// or uploaded then dropped before the save), while keeping referenced ones and the
// column-tracked featured image.
func TestArticles_UpdateReclaimsDroppedInlineMedia(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	base := "cms/articles/" + art.ID.String() + "/"
	keep := base + "inline-keep.png"
	drop := base + "inline-drop.png"
	feat := base + "featured-x.png"
	e.store.Saved[keep] = []byte("x")
	e.store.Saved[drop] = []byte("x") // uploaded then removed from the body
	e.store.Saved[feat] = []byte("x")

	// New body references only the kept inline image (src = served URL, which
	// embeds the storage key).
	body := `<p>hi</p><img src="https://cdn.test/` + keep + `" alt="k">`
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, BodyHTML: &body})
	require.NoError(t, err)

	require.Contains(t, e.store.Saved, keep)    // referenced → kept
	require.NotContains(t, e.store.Saved, drop) // unreferenced inline → reclaimed
	require.Contains(t, e.store.Saved, feat)    // featured tracked by column → kept
}

// Replacing the featured image deletes the previous file (served live, so the
// old path is unreferenced once the column is updated).
func TestArticles_UpdateReplacesFeaturedDeletesOld(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	old := "cms/articles/" + art.ID.String() + "/featured-old.png"
	art.FeaturedPath = &old // pre-existing featured image
	newP := "cms/articles/" + art.ID.String() + "/featured-new.png"
	e.store.Saved[old] = []byte("x")
	e.store.Saved[newP] = []byte("x")

	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, FeaturedPath: &newP})
	require.NoError(t, err)

	require.NotContains(t, e.store.Saved, old) // replaced → old deleted
	require.Contains(t, e.store.Saved, newP)   // new one kept
}
