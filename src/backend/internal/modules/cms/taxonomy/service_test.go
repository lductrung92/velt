package taxonomy

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// --- Categories ---

func TestListCategories_RequiresViewPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith())
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestListCategories_TreeAndCounts(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedCategory("News", "news", nil)
	child := e.repo.seedCategory("Sport", "sport", &root.ID)
	e.repo.catArticles[root.ID] = 2
	e.repo.catArticles[child.ID] = 5

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView))
	require.NoError(t, err)
	require.Len(t, tree, 1)
	require.Equal(t, root.ID, tree[0].ID)
	require.Equal(t, 2, tree[0].ArticleCount)
	require.Len(t, tree[0].Children, 1)
	require.Equal(t, child.ID, tree[0].Children[0].ID)
	require.Equal(t, 5, tree[0].Children[0].ArticleCount)
	require.Empty(t, tree[0].Children[0].Children)
}

func TestCreateCategory_DerivesSlug(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreateCategory(context.Background(), cmstest.ActorWith(permManage), CreateCategoryRequest{Name: "Tin Tức"})
	require.NoError(t, err)
	require.Equal(t, "tin-tuc", res.Slug)
	require.Nil(t, res.ParentID)
	require.Equal(t, 0, res.ArticleCount)
	require.NotNil(t, res.Children) // never null in JSON
}

func TestCreateCategory_ExplicitSlugNormalized(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "X", Slug: cmstest.Strptr("My Slug!!")})
	require.NoError(t, err)
	require.Equal(t, "my-slug", res.Slug)
}

func TestCreateCategory_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateCategory(context.Background(), cmstest.ActorWith(permView), CreateCategoryRequest{Name: "News"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestCreateCategory_SlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedCategory("News", "news", nil)
	_, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "News"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestCreateCategory_ParentNotFound(t *testing.T) {
	e := newTestSvc(t)
	missing := uuid.New()
	_, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "Child", ParentID: &missing})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestCreateCategory_UnsluggableName(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "!!!"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestCreateCategory_UnsluggableName_FieldIsSlug(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "!!!"})
	cmstest.AssertFieldErr(t, err, "slug", "invalid_slug")
}

func TestUpdateCategory_RegenerateSlugWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	c := e.repo.seedCategory("News", "old-slug", nil)
	res, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), c.ID,
		UpdateCategoryRequest{Name: cmstest.Strptr("Breaking News"), RegenerateSlug: true, UpdatedAt: &c.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "breaking-news", res.Slug)
}

func TestUpdateCategory_KeepSlugWhenNotRegenerating(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	c := e.repo.seedCategory("News", "news", nil)
	res, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), c.ID,
		UpdateCategoryRequest{Name: cmstest.Strptr("Breaking News"), UpdatedAt: &c.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "news", res.Slug)
}

func TestCreateCategory_AutoSuffixWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedCategory("News", "news", nil)
	res, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "News"})
	require.NoError(t, err)
	require.Equal(t, "news-01", res.Slug)
}

func TestCreateCategory_AutoSuffixSkipsTakenSuffixes(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedCategory("News", "news", nil)
	e.repo.seedCategory("News 1", "news-01", nil)
	res, err := e.svc.CreateCategory(context.Background(), cmstest.SuperActor(), CreateCategoryRequest{Name: "News"})
	require.NoError(t, err)
	require.Equal(t, "news-02", res.Slug)
}

func TestUpdateCategory_NotFound(t *testing.T) {
	e := newTestSvc(t)
	now := e.clk
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), uuid.New(), UpdateCategoryRequest{Name: cmstest.Strptr("X"), UpdatedAt: &now})
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestUpdateCategory_OptimisticLockConflict(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedCategory("News", "news", nil)
	stale := c.UpdatedAt.Add(-time.Hour)
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), c.ID,
		UpdateCategoryRequest{Name: cmstest.Strptr("X"), UpdatedAt: &stale})
	cmstest.AssertAppErr(t, err, http.StatusConflict, "conflict")
}

func TestUpdateCategory_MoveToSelfCycle(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedCategory("News", "news", nil)
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), c.ID,
		UpdateCategoryRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: &c.ID}})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "category_cycle")
}

func TestUpdateCategory_MoveUnderDescendantCycle(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedCategory("News", "news", nil)
	child := e.repo.seedCategory("Sport", "sport", &root.ID)
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), root.ID,
		UpdateCategoryRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: &child.ID}})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "category_cycle")
}

func TestUpdateCategory_MoveToRoot(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedCategory("News", "news", nil)
	child := e.repo.seedCategory("Sport", "sport", &root.ID)
	res, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), child.ID,
		UpdateCategoryRequest{ParentID: shared.Optional[uuid.UUID]{Set: true, Value: nil}, UpdatedAt: &child.UpdatedAt})
	require.NoError(t, err)
	require.Nil(t, res.ParentID)
}

func TestUpdateCategory_SlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedCategory("A", "a", nil)
	b := e.repo.seedCategory("B", "b", nil)
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.SuperActor(), b.ID, UpdateCategoryRequest{Slug: cmstest.Strptr("a"), UpdatedAt: &b.UpdatedAt})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestUpdateCategory_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedCategory("A", "a", nil)
	_, err := e.svc.UpdateCategory(context.Background(), cmstest.ActorWith(permView), c.ID, UpdateCategoryRequest{Name: cmstest.Strptr("B")})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestDeleteCategory_Success(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedCategory("A", "a", nil)
	require.NoError(t, e.svc.DeleteCategory(context.Background(), cmstest.SuperActor(), c.ID))
	_, ok := e.repo.cats[c.ID]
	require.False(t, ok)
}

func TestDeleteCategory_HasChildren(t *testing.T) {
	e := newTestSvc(t)
	root := e.repo.seedCategory("A", "a", nil)
	e.repo.seedCategory("B", "b", &root.ID)
	err := e.svc.DeleteCategory(context.Background(), cmstest.SuperActor(), root.ID)
	cmstest.AssertAppErr(t, err, http.StatusConflict, "category_in_use")
}

func TestDeleteCategory_HasArticles(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedCategory("A", "a", nil)
	e.repo.catArticles[c.ID] = 3
	err := e.svc.DeleteCategory(context.Background(), cmstest.SuperActor(), c.ID)
	cmstest.AssertAppErr(t, err, http.StatusConflict, "category_in_use")
}

func TestDeleteCategory_NotFound(t *testing.T) {
	e := newTestSvc(t)
	err := e.svc.DeleteCategory(context.Background(), cmstest.SuperActor(), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

// --- Tags ---

func TestListTags_RequiresViewPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(), TagListParams{})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestListTags_Counts(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	e.repo.tagUsage[tg.ID] = 7
	res, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(permView), TagListParams{})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Len(t, res.Items, 1)
	require.Equal(t, 7, res.Items[0].UsageCount)
}

func TestListTags_PaginatesAndDefaults(t *testing.T) {
	e := newTestSvc(t)
	for i := 0; i < 25; i++ {
		e.repo.seedTag(fmt.Sprintf("Tag %02d", i), fmt.Sprintf("tag-%02d", i))
	}
	// Page<1 and PageSize<1 fall back to page 1 / size 20.
	res, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(permView), TagListParams{Page: 0, PageSize: 0})
	require.NoError(t, err)
	require.Equal(t, 25, res.Total)
	require.Equal(t, 1, res.Page)
	require.Equal(t, 20, res.PageSize)
	require.Len(t, res.Items, 20)

	res2, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(permView), TagListParams{Page: 2, PageSize: 20})
	require.NoError(t, err)
	require.Len(t, res2.Items, 5)
}

func TestListTags_PageSizeCapped(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(permView), TagListParams{PageSize: 9999})
	require.NoError(t, err)
	require.Equal(t, 20, res.PageSize) // over maxTagPageSize → default 20
}

func TestListTags_SearchFiltersNameOrSlug(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedTag("Golang", "golang")
	e.repo.seedTag("Rust", "rust")
	res, err := e.svc.ListTags(context.Background(), cmstest.ActorWith(permView), TagListParams{Query: "go"})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Equal(t, "Golang", res.Items[0].Name)
}

func TestListTagOptions_ReturnsFullSet(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedTag("Beta", "beta")
	e.repo.seedTag("Alpha", "alpha")
	opts, err := e.svc.ListTagOptions(context.Background(), cmstest.ActorWith(permView))
	require.NoError(t, err)
	require.Len(t, opts, 2)
	require.Equal(t, "Alpha", opts[0].Name) // ordered by name
}

func TestListTagOptions_RequiresViewPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListTagOptions(context.Background(), cmstest.ActorWith())
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestCreateTag_Success(t *testing.T) {
	e := newTestSvc(t)
	res, err := e.svc.CreateTag(context.Background(), cmstest.ActorWith(permManage), CreateTagRequest{Name: "Lập Trình"})
	require.NoError(t, err)
	require.Equal(t, "lap-trinh", res.Slug)
	require.Equal(t, 0, res.UsageCount)
}

func TestCreateTag_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.CreateTag(context.Background(), cmstest.ActorWith(permView), CreateTagRequest{Name: "Go"})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestCreateTag_SlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedTag("Go", "go")
	_, err := e.svc.CreateTag(context.Background(), cmstest.SuperActor(), CreateTagRequest{Name: "Go"})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestCreateTag_AutoSuffixWhenManualEditOff(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedTag("Go", "go")
	res, err := e.svc.CreateTag(context.Background(), cmstest.SuperActor(), CreateTagRequest{Name: "Go"})
	require.NoError(t, err)
	require.Equal(t, "go-01", res.Slug)
}

func TestCreateTag_AutoSuffixSkipsTakenSuffixes(t *testing.T) {
	e := newTestSvc(t)
	e.settings.Group = []map[string]any{{"key": shared.FlagArticleAllowSlugEdit, "type": "bool", "value": false}}
	e.repo.seedTag("Go", "go")
	e.repo.seedTag("Go 1", "go-01")
	res, err := e.svc.CreateTag(context.Background(), cmstest.SuperActor(), CreateTagRequest{Name: "Go"})
	require.NoError(t, err)
	require.Equal(t, "go-02", res.Slug)
}

func TestUpdateTag_NotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.UpdateTag(context.Background(), cmstest.SuperActor(), uuid.New(), UpdateTagRequest{Name: cmstest.Strptr("X")})
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestUpdateTag_SlugConflict(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedTag("Go", "go")
	rust := e.repo.seedTag("Rust", "rust")
	_, err := e.svc.UpdateTag(context.Background(), cmstest.SuperActor(), rust.ID, UpdateTagRequest{Slug: cmstest.Strptr("go")})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "slug_already_exists")
}

func TestUpdateTag_EmptySlugInvalid_FieldIsSlug(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	_, err := e.svc.UpdateTag(context.Background(), cmstest.SuperActor(), tg.ID, UpdateTagRequest{Slug: cmstest.Strptr("")})
	cmstest.AssertFieldErr(t, err, "slug", "invalid_slug")
}

func TestMergeTags_SelfMerge_FieldKey(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	_, err := e.svc.MergeTags(context.Background(), cmstest.SuperActor(), MergeTagsRequest{SourceID: tg.ID, TargetID: tg.ID})
	cmstest.AssertFieldErr(t, err, "target_id", "invalid_value")
}

func TestUpdateTag_Success(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	res, err := e.svc.UpdateTag(context.Background(), cmstest.SuperActor(), tg.ID, UpdateTagRequest{Name: cmstest.Strptr("Golang")})
	require.NoError(t, err)
	require.Equal(t, "Golang", res.Name)
	require.Equal(t, "go", res.Slug) // slug unchanged when not provided
}

func TestDeleteTag_Success(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	require.NoError(t, e.svc.DeleteTag(context.Background(), cmstest.SuperActor(), tg.ID))
	_, ok := e.repo.tags[tg.ID]
	require.False(t, ok)
}

func TestDeleteTag_NotFound(t *testing.T) {
	e := newTestSvc(t)
	err := e.svc.DeleteTag(context.Background(), cmstest.SuperActor(), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestMergeTags_Success(t *testing.T) {
	e := newTestSvc(t)
	src := e.repo.seedTag("Golang", "golang")
	dst := e.repo.seedTag("Go", "go")
	e.repo.tagUsage[src.ID] = 2
	e.repo.tagUsage[dst.ID] = 1
	res, err := e.svc.MergeTags(context.Background(), cmstest.SuperActor(), MergeTagsRequest{SourceID: src.ID, TargetID: dst.ID})
	require.NoError(t, err)
	require.Equal(t, dst.ID, res.ID)
	require.Equal(t, 3, res.UsageCount)
	_, ok := e.repo.tags[src.ID]
	require.False(t, ok, "source tag deleted")
}

func TestMergeTags_SelfMerge(t *testing.T) {
	e := newTestSvc(t)
	tg := e.repo.seedTag("Go", "go")
	_, err := e.svc.MergeTags(context.Background(), cmstest.SuperActor(), MergeTagsRequest{SourceID: tg.ID, TargetID: tg.ID})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestMergeTags_SourceMissing(t *testing.T) {
	e := newTestSvc(t)
	dst := e.repo.seedTag("Go", "go")
	_, err := e.svc.MergeTags(context.Background(), cmstest.SuperActor(), MergeTagsRequest{SourceID: uuid.New(), TargetID: dst.ID})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestMergeTags_TargetMissing(t *testing.T) {
	e := newTestSvc(t)
	src := e.repo.seedTag("Go", "go")
	_, err := e.svc.MergeTags(context.Background(), cmstest.SuperActor(), MergeTagsRequest{SourceID: src.ID, TargetID: uuid.New()})
	cmstest.AssertAppErr(t, err, http.StatusUnprocessableEntity, "validation_error")
}

func TestMergeTags_PermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	src := e.repo.seedTag("a", "a")
	dst := e.repo.seedTag("b", "b")
	_, err := e.svc.MergeTags(context.Background(), cmstest.ActorWith(permView), MergeTagsRequest{SourceID: src.ID, TargetID: dst.ID})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

// --- Auth boundary ---

func TestUnauthenticated(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListCategories(context.Background(), nil)
	cmstest.AssertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
	_, err = e.svc.CreateTag(context.Background(), nil, CreateTagRequest{Name: "Go"})
	cmstest.AssertAppErr(t, err, http.StatusUnauthorized, "unauthorized")
}

// --- slug ---

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Tin Tức":            "tin-tuc",
		"Lập Trình Go":       "lap-trinh-go",
		"  Hello,  World!  ": "hello-world",
		"Đời sống":           "doi-song",
		"C++ & Rust":         "c-rust",
		"already-a-slug":     "already-a-slug",
		"!!!":                "",
		"Số 1":               "so-1",
		"Giáo dục & Đào tạo": "giao-duc-dao-tao",
	}
	for in, want := range cases {
		require.Equal(t, want, shared.Slugify(in), "shared.Slugify(%q)", in)
	}
}
