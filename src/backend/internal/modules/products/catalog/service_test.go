package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/products/shared"
)

var testNow = time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)

func newSvc(t *testing.T) (*Service, *fakeRepo, *fakeStore) {
	t.Helper()
	svc, repo, store, _ := newSvcWithLinks(t)
	return svc, repo, store
}

func newSvcWithLinks(t *testing.T) (*Service, *fakeRepo, *fakeStore, *fakeLinks) {
	t.Helper()
	repo := newFakeRepo(testNow)
	links := newFakeLinks(testNow)
	store := newFakeStore()
	base := shared.NewBase(slog.New(slog.NewTextHandler(io.Discard, nil)))
	return NewService(base, repo, links, store, store, fakeSettings{maxMB: 1}), repo, store, links
}

func author() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView, permCreate, permEdit}}
}

func publisher() *httpx.Identity {
	return &httpx.Identity{
		UserID:      uuid.New(),
		Permissions: []string{permView, permCreate, permEdit, permDelete, permPublish},
	}
}

func str(s string) *string { return &s }
func boolp(b bool) *bool   { return &b }

func status(t *testing.T, err error) int {
	t.Helper()
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	return ae.Status
}

func create(t *testing.T, svc *Service, id *httpx.Identity, req CreateRequest) Response {
	t.Helper()
	res, err := svc.Create(context.Background(), id, req)
	require.NoError(t, err)
	return res
}

// --- Permissions ---

func TestCreate_RequiresCreatePermission(t *testing.T) {
	svc, _, _ := newSvc(t)
	viewer := &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView}}
	_, err := svc.Create(context.Background(), viewer, CreateRequest{Name: "A"})
	require.Equal(t, 403, status(t, err))
}

func TestPublish_RequiresPublishPermission(t *testing.T) {
	// The whole point of a separate publish permission: an editor may author but
	// not put a product in front of customers.
	svc, _, _ := newSvc(t)
	ctx, ed := context.Background(), author()
	p := create(t, svc, ed, CreateRequest{Name: "A"})

	_, err := svc.Publish(ctx, ed, p.ID)
	require.Equal(t, 403, status(t, err))
}

func TestDelete_RequiresDeletePermission(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, ed := context.Background(), author()
	p := create(t, svc, ed, CreateRequest{Name: "A"})
	require.Equal(t, 403, status(t, svc.Delete(ctx, ed, p.ID)))
}

func TestUnauthenticatedIsRejected(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.List(context.Background(), nil, ListParams{})
	require.Equal(t, 401, status(t, err))
}

// --- Create ---

func TestCreate_DerivesSlugAndStartsAsDraftIdea(t *testing.T) {
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{Name: "Bảng công việc"})
	require.Equal(t, "bang-cong-viec", p.Slug)
	require.Equal(t, StatusDraft, p.Status)
	require.Equal(t, LifecycleIdea, p.Lifecycle)
}

func TestCreate_SuffixesCollidingSlug(t *testing.T) {
	svc, _, _ := newSvc(t)
	id := author()
	a := create(t, svc, id, CreateRequest{Name: "Bảng công việc"})
	b := create(t, svc, id, CreateRequest{Name: "Bảng công việc"})
	require.Equal(t, "bang-cong-viec", a.Slug)
	require.Equal(t, "bang-cong-viec-01", b.Slug)
}

func TestCreate_RejectsBlankName(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), author(), CreateRequest{Name: "   "})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_RejectsInvalidLifecycle(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), author(), CreateRequest{
		Name: "A", Lifecycle: str("shipped"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_RejectsClientSuppliedCoverPath(t *testing.T) {
	// A create has no id yet, so there is no prefix to validate the path against;
	// accepting one would mean trusting a client-chosen storage key.
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), author(), CreateRequest{
		Name: "A", CoverPath: str("members/other/avatar.png"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_NormalisesLists(t *testing.T) {
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{
		Name:      "A",
		TechStack: []string{" Go ", "Go", "", "React"},
		Audience:  []string{"team"},
	})
	require.Equal(t, []string{"Go", "React"}, p.TechStack)
	require.Equal(t, []string{"team"}, p.Audience)
	require.Equal(t, []string{}, p.Highlights, "absent lists serialise as [] not null")
}

func TestCreate_ParsesReleasedAt(t *testing.T) {
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{Name: "A", ReleasedAt: str("2026-03-01")})
	require.Equal(t, "2026-03-01", *p.ReleasedAt)

	_, err := svc.Create(context.Background(), author(), CreateRequest{
		Name: "B", ReleasedAt: str("01/03/2026"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_AppendsToEndOfCatalog(t *testing.T) {
	svc, repo, _ := newSvc(t)
	id := author()
	create(t, svc, id, CreateRequest{Name: "First"})
	second := create(t, svc, id, CreateRequest{Name: "Second"})
	require.Equal(t, 1, repo.rows[second.ID].SortOrder)
}

// --- Rich text + URL hardening ---

func TestCreate_SanitisesBodyHTML(t *testing.T) {
	// body_html is rendered as raw HTML on the public site, so the allowlist is
	// the only thing between an author and stored XSS.
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{
		Name:     "A",
		BodyHTML: str(`<p>Xin chào</p><script>alert(1)</script><img src=x onerror=alert(1)>`),
	})
	require.NotNil(t, p.BodyHTML)
	require.NotContains(t, *p.BodyHTML, "<script")
	require.NotContains(t, *p.BodyHTML, "onerror")
	require.Contains(t, *p.BodyHTML, "Xin chào")
}

func TestCreate_RejectsDangerousURLSchemes(t *testing.T) {
	svc, _, _ := newSvc(t)
	for _, tc := range []struct {
		field string
		req   CreateRequest
	}{
		{"product_url", CreateRequest{Name: "A", ProductURL: str("javascript:alert(1)")}},
		{"demo_url", CreateRequest{Name: "A", DemoURL: str("data:text/html,x")}},
		{"demo_url", CreateRequest{Name: "A", DemoURL: str("/relative")}},
		{"canonical", CreateRequest{Name: "A", SEO: &SEO{Canonical: str("javascript:void(0)")}}},
	} {
		_, err := svc.Create(context.Background(), author(), tc.req)
		require.Equal(t, 422, status(t, err), "must reject %s", tc.field)
	}
}

func TestCreate_AcceptsHTTPURLs(t *testing.T) {
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{
		Name:       "A",
		ProductURL: str("https://velt.vn/bang-cong-viec"),
		DemoURL:    str("http://demo.velt.vn"),
	})
	require.Equal(t, "https://velt.vn/bang-cong-viec", *p.ProductURL)
	require.Equal(t, "http://demo.velt.vn", *p.DemoURL)
}

// --- Update ---

func TestUpdate_AbsentFieldsAreUntouched(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{
		Name: "A", Summary: str("Tóm tắt"), TechStack: []string{"Go"},
	})

	u, err := svc.Update(ctx, id, p.ID, UpdateRequest{Version: str("1.2.0")})
	require.NoError(t, err)
	require.Equal(t, "Tóm tắt", *u.Summary)
	require.Equal(t, []string{"Go"}, u.TechStack)
	require.Equal(t, p.Slug, u.Slug, "slug must not drift on an unrelated patch")
	require.Equal(t, "1.2.0", *u.Version)
}

func TestUpdate_EmptyStringClearsOptionalField(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A", Summary: str("Tóm tắt")})

	u, err := svc.Update(ctx, id, p.ID, UpdateRequest{Summary: str("")})
	require.NoError(t, err)
	require.Nil(t, u.Summary)
}

func TestUpdate_RejectsCoverPathOutsideOwnFolder(t *testing.T) {
	// Defence against a spoofed path pointing at another entity's storage.
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.Update(ctx, id, p.ID, UpdateRequest{
		CoverPath: str("members/" + uuid.NewString() + "/avatar.png"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestUpdate_AcceptsCoverPathInOwnFolder(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	own := "products/" + p.ID.String() + "/cover-1.png"

	u, err := svc.Update(ctx, id, p.ID, UpdateRequest{CoverPath: &own})
	require.NoError(t, err)
	require.Equal(t, own, *u.CoverPath)
	require.Equal(t, "/api/files/"+own, *u.CoverURL)
}

func TestUpdate_ReplacingCoverDeletesTheOldFile(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	first := "products/" + p.ID.String() + "/cover-1.png"
	second := "products/" + p.ID.String() + "/cover-2.png"

	_, err := svc.Update(ctx, id, p.ID, UpdateRequest{CoverPath: &first})
	require.NoError(t, err)
	_, err = svc.Update(ctx, id, p.ID, UpdateRequest{CoverPath: &second})
	require.NoError(t, err)
	require.Contains(t, store.deleted, first)
}

func TestUpdate_KeepsOldCoverWhileASnapshotStillUsesIt(t *testing.T) {
	// The frozen public copy must keep rendering after the draft moves on.
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	first := "products/" + p.ID.String() + "/cover-1.png"
	_, err := svc.Update(ctx, id, p.ID, UpdateRequest{CoverPath: &first})
	require.NoError(t, err)
	_, err = svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	second := "products/" + p.ID.String() + "/cover-2.png"
	_, err = svc.Update(ctx, id, p.ID, UpdateRequest{CoverPath: &second})
	require.NoError(t, err)
	require.NotContains(t, store.deleted, first)
}

func TestUpdate_NotFound(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Update(context.Background(), author(), uuid.New(), UpdateRequest{})
	require.Equal(t, 404, status(t, err))
}

// --- Publication ---

func TestPublish_FreezesSnapshotAndStampsDate(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A", Summary: str("Bản gốc")})

	pub, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, StatusPublished, pub.Status)
	require.NotNil(t, pub.PublishedAt)

	var snap Response
	require.NoError(t, json.Unmarshal(repo.rows[p.ID].PublishedSnapshot, &snap))
	require.Equal(t, "Bản gốc", *snap.Summary)
}

func TestPublish_SnapshotDoesNotFollowLaterEdits(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A", Summary: str("Bản gốc")})
	_, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	_, err = svc.Update(ctx, id, p.ID, UpdateRequest{Summary: str("Bản nháp mới")})
	require.NoError(t, err)

	var snap Response
	require.NoError(t, json.Unmarshal(repo.rows[p.ID].PublishedSnapshot, &snap))
	require.Equal(t, "Bản gốc", *snap.Summary, "the public copy must not follow the draft")
}

func TestUnpublish_KeepsSnapshotAndFirstPublishedDate(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	pub, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)
	firstPublished := *pub.PublishedAt

	back, err := svc.Unpublish(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, StatusDraft, back.Status)
	require.NotNil(t, repo.rows[p.ID].PublishedSnapshot)
	require.Equal(t, firstPublished, *back.PublishedAt, "re-publishing is a restore, not a new release")
}

func TestArchiveTakesItOffTheSiteButKeepsTheRow(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	_, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	arch, err := svc.Archive(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, StatusArchived, arch.Status)
	require.NotNil(t, repo.rows[p.ID])
}

func TestTransition_RejectsNoOp(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.Unpublish(ctx, id, p.ID) // already draft
	require.Equal(t, 409, status(t, err))
}

func TestLifecycleIsIndependentOfStatus(t *testing.T) {
	// Publishing a product that is still an idea is a supported product state,
	// not an error — that is why the two axes are separate columns.
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A", Lifecycle: str(LifecycleIdea)})

	pub, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, StatusPublished, pub.Status)
	require.Equal(t, LifecycleIdea, pub.Lifecycle)
}

// --- Delete ---

func TestDelete_PurgesTheWholeMediaFolder(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	_, err := svc.UploadMedia(ctx, id, p.ID, "cover", bytes.NewReader(pngBytes))
	require.NoError(t, err)

	require.NoError(t, svc.Delete(ctx, id, p.ID))
	require.Contains(t, store.purged, "products/"+p.ID.String()+"/")
	require.Empty(t, store.saved)
}

// --- Upload ---

var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)

func TestUploadMedia_StoresUnderTheProductsOwnPrefix(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	res, err := svc.UploadMedia(ctx, id, p.ID, "cover", bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(res.Path, "products/"+p.ID.String()+"/cover-"))
	require.True(t, strings.HasSuffix(res.Path, ".png"))
	require.Len(t, store.saved, 1)
}

func TestUploadMedia_RejectsUnknownPurpose(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.UploadMedia(ctx, id, p.ID, "../escape", bytes.NewReader(pngBytes))
	require.Equal(t, 422, status(t, err))
}

func TestUploadMedia_RejectsNonImage(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.UploadMedia(ctx, id, p.ID, "cover", strings.NewReader("<?php echo 1; ?>"))
	require.Equal(t, 415, status(t, err))
	require.Empty(t, store.saved, "a rejected upload must not reach storage")
}

func TestUploadMedia_RejectsOversize(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	big := append(append([]byte{}, pngBytes...), bytes.Repeat([]byte{1}, 2<<20)...)
	_, err := svc.UploadMedia(ctx, id, p.ID, "cover", bytes.NewReader(big))
	require.Equal(t, 413, status(t, err))
}

// --- List ---

func TestList_FiltersAndClampsPageSize(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	a := create(t, svc, id, CreateRequest{Name: "Published one"})
	create(t, svc, id, CreateRequest{Name: "Draft one"})
	_, err := svc.Publish(ctx, id, a.ID)
	require.NoError(t, err)

	res, err := svc.List(ctx, id, ListParams{Status: StatusPublished, PageSize: 5000})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Equal(t, "Published one", res.Items[0].Name)
	require.Equal(t, maxPageSize, res.PageSize)
	require.Equal(t, 1, res.Page)
}

func TestList_FiltersByFeatured(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), author()
	create(t, svc, id, CreateRequest{Name: "Plain"})
	create(t, svc, id, CreateRequest{Name: "Starred", IsFeatured: boolp(true)})

	res, err := svc.List(ctx, id, ListParams{Featured: boolp(true)})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Equal(t, "Starred", res.Items[0].Name)
}
