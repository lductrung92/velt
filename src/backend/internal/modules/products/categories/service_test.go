package categories

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/products/shared"
)

var testNow = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

func newSvc(t *testing.T) (*Service, *fakeRepo) {
	t.Helper()
	repo := newFakeRepo(testNow)
	base := shared.NewBase(slog.New(slog.NewTextHandler(io.Discard, nil)))
	return NewService(base, repo), repo
}

func manager() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView, permManage}}
}

func viewer() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView}}
}

func str(s string) *string { return &s }

func status(t *testing.T, err error) int {
	t.Helper()
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	return ae.Status
}

// --- Permissions ---

func TestCreate_RequiresManagePermission(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Create(context.Background(), viewer(), CreateRequest{Name: "Cộng tác"})
	require.Equal(t, 403, status(t, err))
}

func TestList_RequiresViewPermission(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.List(context.Background(), &httpx.Identity{UserID: uuid.New()}, "", "")
	require.Equal(t, 403, status(t, err))
}

func TestUnauthenticatedIsRejected(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.List(context.Background(), nil, "", "")
	require.Equal(t, 401, status(t, err))
}

func TestWildcardPermissionPasses(t *testing.T) {
	svc, _ := newSvc(t)
	super := &httpx.Identity{UserID: uuid.New(), Permissions: []string{"*"}}
	_, err := svc.Create(context.Background(), super, CreateRequest{Name: "AI"})
	require.NoError(t, err)
}

// --- Create ---

func TestCreate_DerivesSlugFromVietnameseName(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "Quản lý & vận hành",
	})
	require.NoError(t, err)
	require.Equal(t, "quan-ly-van-hanh", res.Slug)
}

func TestCreate_SuffixesCollidingSlug(t *testing.T) {
	// A category slug appears in public filter URLs, so a collision must not
	// surface as an error the admin has to resolve by hand.
	svc, _ := newSvc(t)
	id := manager()
	ctx := context.Background()

	first, err := svc.Create(ctx, id, CreateRequest{Name: "Cộng tác"})
	require.NoError(t, err)
	require.Equal(t, "cong-tac", first.Slug)

	second, err := svc.Create(ctx, id, CreateRequest{Name: "Cộng tác"})
	require.NoError(t, err)
	require.Equal(t, "cong-tac-01", second.Slug)
}

func TestCreate_HonoursExplicitSlug(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "Công cụ cá nhân", Slug: str("personal-tools"),
	})
	require.NoError(t, err)
	require.Equal(t, "personal-tools", res.Slug)
}

func TestCreate_RejectsBlankName(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{Name: "   "})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_RejectsUnusableName(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{Name: "!!! ???"})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_AppendsToEndOfTaxonomy(t *testing.T) {
	svc, repo := newSvc(t)
	ctx, id := context.Background(), manager()
	_, err := svc.Create(ctx, id, CreateRequest{Name: "First"})
	require.NoError(t, err)
	second, err := svc.Create(ctx, id, CreateRequest{Name: "Second"})
	require.NoError(t, err)
	require.Equal(t, 1, repo.rows[second.ID].SortOrder)
}

func TestCreate_BlankDescriptionBecomesNull(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "A", Description: str("   "),
	})
	require.NoError(t, err)
	require.Nil(t, res.Description)
}

// --- Update ---

func TestUpdate_AbsentFieldsAreUntouched(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A", Description: str("Mô tả")})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Name: str("B")})
	require.NoError(t, err)
	require.Equal(t, "B", updated.Name)
	require.Equal(t, "Mô tả", *updated.Description)
	require.Equal(t, created.Slug, updated.Slug, "slug must not drift on an unrelated patch")
}

func TestUpdate_EmptyDescriptionClearsIt(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A", Description: str("Mô tả")})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Description: str("")})
	require.NoError(t, err)
	require.Nil(t, updated.Description)
}

func TestUpdate_KeepsOwnSlugWhenUnchanged(t *testing.T) {
	// The uniqueness probe must exclude the row being edited, or re-saving the
	// same slug would walk to -01.
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Slug: str(created.Slug)})
	require.NoError(t, err)
	require.Equal(t, created.Slug, updated.Slug)
}

func TestUpdate_ExplicitEmptySlugFallsBackToName(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{
		Name: str("Trí tuệ nhân tạo"), Slug: str(""),
	})
	require.NoError(t, err)
	require.Equal(t, "tri-tue-nhan-tao", updated.Slug)
}

func TestUpdate_NotFound(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.Update(context.Background(), manager(), uuid.New(), UpdateRequest{})
	require.Equal(t, 404, status(t, err))
}

func TestUpdate_RejectsBlankName(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)

	_, err = svc.Update(ctx, id, created.ID, UpdateRequest{Name: str("  ")})
	require.Equal(t, 422, status(t, err))
}

// --- Delete / reorder / list ---

func TestDelete_NotFound(t *testing.T) {
	svc, _ := newSvc(t)
	err := svc.Delete(context.Background(), manager(), uuid.New())
	require.Equal(t, 404, status(t, err))
}

func TestDelete_RequiresManagePermission(t *testing.T) {
	svc, _ := newSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{Name: "A"})
	require.NoError(t, err)

	require.Equal(t, 403, status(t, svc.Delete(ctx, viewer(), created.ID)))
}

func TestReorder_RewritesSortOrder(t *testing.T) {
	svc, repo := newSvc(t)
	ctx, id := context.Background(), manager()
	a, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)
	b, err := svc.Create(ctx, id, CreateRequest{Name: "B"})
	require.NoError(t, err)

	require.NoError(t, svc.Reorder(ctx, id, []uuid.UUID{b.ID, a.ID}))
	require.Equal(t, 0, repo.rows[b.ID].SortOrder)
	require.Equal(t, 1, repo.rows[a.ID].SortOrder)
}

func TestReorder_RejectsDuplicateIDs(t *testing.T) {
	svc, _ := newSvc(t)
	id := uuid.New()
	err := svc.Reorder(context.Background(), manager(), []uuid.UUID{id, id})
	require.Equal(t, 422, status(t, err))
}

func TestList_IsOrderedBySortOrder(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	a, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)
	b, err := svc.Create(ctx, id, CreateRequest{Name: "B"})
	require.NoError(t, err)
	require.NoError(t, svc.Reorder(ctx, id, []uuid.UUID{b.ID, a.ID}))

	res, err := svc.List(ctx, id, "", "")
	require.NoError(t, err)
	require.Equal(t, []string{"B", "A"}, []string{res.Items[0].Name, res.Items[1].Name})
}

func TestList_RefusesWithoutPermission(t *testing.T) {
	// This package has no unauthenticated read any more. It used to: ListPublic
	// called the same helper List calls AFTER the permission check, and was
	// mounted on /api/public/product-categories. It only stayed harmless because
	// catalog registered the same path later and chi keeps the last handler.
	// The public projection lives in catalog.PublicService; this one is gated.
	svc, _ := newSvc(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, manager(), CreateRequest{Name: "Cộng tác"})
	require.NoError(t, err)

	_, err = svc.List(ctx, nil, "", "")
	require.Error(t, err)

	_, err = svc.List(ctx, &httpx.Identity{Permissions: []string{"products.view"}}, "", "")
	require.NoError(t, err)
}

// --- SEO + sort order ---
//
// Mirrors cms_categories: the public category landing needs its own meta, and
// the admin curates display order by hand.

func TestCreate_StoresSEO(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "Cộng tác",
		SEO: &CategorySEO{
			Title:       str("Công cụ cộng tác | VELT"),
			Description: str("Phần mềm làm việc nhóm"),
			Keywords:    str("cong tac, nhom"),
		},
	})
	require.NoError(t, err)
	require.Equal(t, "Công cụ cộng tác | VELT", *res.SEO.Title)
	require.Equal(t, "Phần mềm làm việc nhóm", *res.SEO.Description)
	require.Equal(t, "cong tac, nhom", *res.SEO.Keywords)
}

func TestCreate_BlankSEOFieldsBecomeNull(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "A",
		SEO:  &CategorySEO{Title: str("  "), Description: str("")},
	})
	require.NoError(t, err)
	require.Nil(t, res.SEO.Title)
	require.Nil(t, res.SEO.Description)
	require.Nil(t, res.SEO.Keywords)
}

func TestUpdate_OmittedSEOObjectLeavesMetaAlone(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{
		Name: "A", SEO: &CategorySEO{Title: str("Giữ nguyên")},
	})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Name: str("B")})
	require.NoError(t, err)
	require.Equal(t, "Giữ nguyên", *updated.SEO.Title)
}

func TestUpdate_PresentSEOObjectReplacesEveryField(t *testing.T) {
	// A present `seo` replaces all three, so clearing one field is just sending
	// it empty — there is no per-field patch to get wrong.
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{
		Name: "A",
		SEO:  &CategorySEO{Title: str("Cũ"), Keywords: str("a, b")},
	})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{
		SEO: &CategorySEO{Title: str("Mới")},
	})
	require.NoError(t, err)
	require.Equal(t, "Mới", *updated.SEO.Title)
	require.Nil(t, updated.SEO.Keywords, "an absent key inside a present seo object clears it")
}

func TestCreate_HonoursExplicitSortOrder(t *testing.T) {
	svc, repo := newSvc(t)
	order := 7
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		Name: "A", SortOrder: &order,
	})
	require.NoError(t, err)
	require.Equal(t, 7, repo.rows[res.ID].SortOrder)
}

func TestUpdate_ChangesSortOrder(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A"})
	require.NoError(t, err)

	order := 42
	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{SortOrder: &order})
	require.NoError(t, err)
	require.Equal(t, 42, updated.SortOrder)
}

func TestUpdate_OmittedSortOrderIsKept(t *testing.T) {
	svc, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	order := 5
	created, err := svc.Create(ctx, id, CreateRequest{Name: "A", SortOrder: &order})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Name: str("B")})
	require.NoError(t, err)
	require.Equal(t, 5, updated.SortOrder)
}

// --- Status ---

func TestCreate_DefaultsToPublished(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{Name: "Phần mềm"})
	require.NoError(t, err)
	// Omitting status must not park a new category in draft: every row that
	// predates the column is published, and a create has to mean the same.
	require.Equal(t, StatusPublished, res.Status)
}

func TestCreate_HonoursExplicitStatus(t *testing.T) {
	svc, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{Name: "Nháp", Status: str(StatusDraft)})
	require.NoError(t, err)
	require.Equal(t, StatusDraft, res.Status)
}

func TestUpdate_ChangesAndKeepsStatus(t *testing.T) {
	ctx, id := context.Background(), manager()
	svc, _ := newSvc(t)
	created, err := svc.Create(ctx, id, CreateRequest{Name: "Phần cứng"})
	require.NoError(t, err)

	archived, err := svc.Update(ctx, id, created.ID, UpdateRequest{Status: str(StatusArchived)})
	require.NoError(t, err)
	require.Equal(t, StatusArchived, archived.Status)

	// A patch that says nothing about status leaves it alone.
	renamed, err := svc.Update(ctx, id, created.ID, UpdateRequest{Name: str("Thiết bị")})
	require.NoError(t, err)
	require.Equal(t, StatusArchived, renamed.Status)
}

func TestList_FiltersByStatus(t *testing.T) {
	ctx, id := context.Background(), manager()
	svc, _ := newSvc(t)
	live, err := svc.Create(ctx, id, CreateRequest{Name: "Đang dùng"})
	require.NoError(t, err)
	hidden, err := svc.Create(ctx, id, CreateRequest{Name: "Ẩn", Status: str(StatusDraft)})
	require.NoError(t, err)

	published, err := svc.List(ctx, id, "", StatusPublished)
	require.NoError(t, err)
	require.Len(t, published.Items, 1)
	require.Equal(t, live.ID, published.Items[0].ID)

	drafts, err := svc.List(ctx, id, "", StatusDraft)
	require.NoError(t, err)
	require.Len(t, drafts.Items, 1)
	require.Equal(t, hidden.ID, drafts.Items[0].ID)

	// No filter still answers with everything, so an existing caller that never
	// learned about status is unaffected.
	all, err := svc.List(ctx, id, "", "")
	require.NoError(t, err)
	require.Len(t, all.Items, 2)
}

func TestList_UnknownStatusIsUnprocessable(t *testing.T) {
	svc, _ := newSvc(t)
	_, err := svc.List(context.Background(), manager(), "", "retired")
	require.Equal(t, 422, status(t, err))
}

func TestRequests_RejectUnknownStatusWithUnprocessable(t *testing.T) {
	require.Equal(t, 422, status(t, httpx.Validate(&CreateRequest{Name: "X", Status: str("retired")})))
	require.Equal(t, 422, status(t, httpx.Validate(&UpdateRequest{Status: str("retired")})))
	// The three real values pass the same gate.
	for _, s := range []string{StatusDraft, StatusPublished, StatusArchived} {
		require.NoError(t, httpx.Validate(&CreateRequest{Name: "X", Status: &s}))
	}
}
