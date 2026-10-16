package members

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

var testNow = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

func newSvc(t *testing.T) (*Service, *fakeRepo, *fakeStore) {
	t.Helper()
	repo := newFakeRepo(testNow)
	store := newFakeStore()
	svc := NewService(repo, store, store, fakeSettings{maxMB: 1},
		Options{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	return svc, repo, store
}

func manager() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView, permManage}}
}

func viewer() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView}}
}

func str(s string) *string { return &s }

// status pulls the HTTP status out of an AppError.
func status(t *testing.T, err error) int {
	t.Helper()
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	return ae.Status
}

// --- Permissions ---

func TestCreate_RequiresManagePermission(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), viewer(), CreateRequest{FullName: "A"})
	require.Equal(t, 403, status(t, err))
}

func TestList_RequiresViewPermission(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.List(context.Background(), &httpx.Identity{UserID: uuid.New()}, ListParams{})
	require.Equal(t, 403, status(t, err))
}

func TestWildcardPermissionPasses(t *testing.T) {
	svc, _, _ := newSvc(t)
	super := &httpx.Identity{UserID: uuid.New(), Permissions: []string{"*"}}
	_, err := svc.Create(context.Background(), super, CreateRequest{FullName: "Super"})
	require.NoError(t, err)
}

func TestUnauthenticatedIsRejected(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.List(context.Background(), nil, ListParams{})
	require.Equal(t, 401, status(t, err))
}

// --- Create ---

func TestCreate_DerivesSlugFromVietnameseName(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{FullName: "Nguyễn Văn Đức"})
	require.NoError(t, err)
	require.Equal(t, "nguyen-van-duc", res.Slug)
}

func TestCreate_SuffixesCollidingSlug(t *testing.T) {
	// A member slug is the referral-link key, so a collision must never surface
	// as an error — it gets a -01 suffix instead.
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()

	first, err := svc.Create(ctx, id, CreateRequest{FullName: "Trần An"})
	require.NoError(t, err)
	require.Equal(t, "tran-an", first.Slug)

	second, err := svc.Create(ctx, id, CreateRequest{FullName: "Trần An"})
	require.NoError(t, err)
	require.Equal(t, "tran-an-01", second.Slug)
}

func TestCreate_RejectsUnusableName(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{FullName: "!!! ???"})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_RejectsBlankName(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{FullName: "   "})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_DefaultsToActive(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{FullName: "A"})
	require.NoError(t, err)
	require.True(t, res.IsActive)
}

func TestCreate_NormalisesLinksAndSkills(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A",
		Links:    []LinkInput{{Label: " GitHub ", URL: " https://github.com/a "}},
		Skills:   []string{" Go ", "Go", "", "React"}, // trimmed, de-duped, blanks dropped
	})
	require.NoError(t, err)
	require.Equal(t, []Link{{Label: "GitHub", URL: "https://github.com/a"}}, res.Links)
	require.Equal(t, []string{"Go", "React"}, res.Skills)
}

func TestCreate_RejectsWhitespaceOnlyLinkLabel(t *testing.T) {
	// The struct validator cannot see that "   " is blank, so the service must —
	// otherwise this link would be silently dropped while "" returns 422.
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A",
		Links:    []LinkInput{{Label: "   ", URL: "https://a.example"}},
	})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_AppendsToEndOfRoster(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	_, err := svc.Create(ctx, id, CreateRequest{FullName: "First"})
	require.NoError(t, err)
	second, err := svc.Create(ctx, id, CreateRequest{FullName: "Second"})
	require.NoError(t, err)
	require.Equal(t, 1, repo.rows[second.ID].SortOrder)
}

// --- Update ---

func TestUpdate_AbsentFieldsAreUntouched(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{
		FullName: "A", Role: str("Backend"), Skills: []string{"Go"},
	})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Bio: str("Hello")})
	require.NoError(t, err)
	require.Equal(t, "Backend", *updated.Role)
	require.Equal(t, []string{"Go"}, updated.Skills)
	require.Equal(t, "Hello", *updated.Bio)
	require.Equal(t, created.Slug, updated.Slug, "slug must not drift on an unrelated patch")
}

func TestUpdate_EmptyStringClearsField(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A", Role: str("Backend")})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Role: str("")})
	require.NoError(t, err)
	require.Nil(t, updated.Role)
}

func TestUpdate_ExplicitEmptySlugFallsBackToName(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{
		FullName: str("Lê Bình"), Slug: str(""),
	})
	require.NoError(t, err)
	require.Equal(t, "le-binh", updated.Slug)
}

func TestUpdate_KeepsOwnSlugWhenUnchanged(t *testing.T) {
	// The uniqueness probe must exclude the row being edited, or re-saving the
	// same slug would walk to -01.
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{Slug: str(created.Slug)})
	require.NoError(t, err)
	require.Equal(t, created.Slug, updated.Slug)
}

func TestUpdate_NotFound(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Update(context.Background(), manager(), uuid.New(), UpdateRequest{})
	require.Equal(t, 404, status(t, err))
}

func TestUpdate_CanHideMember(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	hidden := false
	updated, err := svc.Update(ctx, id, created.ID, UpdateRequest{IsActive: &hidden})
	require.NoError(t, err)
	require.False(t, updated.IsActive)
}

// --- Public surface ---

func TestListPublic_HidesInactiveMembers(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	_, err := svc.Create(ctx, id, CreateRequest{FullName: "Visible"})
	require.NoError(t, err)
	hidden, err := svc.Create(ctx, id, CreateRequest{FullName: "Hidden"})
	require.NoError(t, err)
	repo.rows[hidden.ID].IsActive = false

	res, err := svc.ListPublic(ctx, ListParams{})
	require.NoError(t, err)
	require.Equal(t, 1, res.Total)
	require.Equal(t, "Visible", res.Items[0].DisplayName,
		"with no display name set, the public roster falls back to the real one")
	require.Empty(t, res.Items[0].FullName,
		"the real name must not reach an unauthenticated caller")
}

func TestListPublic_ShowsTheDisplayNameInsteadOfTheRealOne(t *testing.T) {
	// The point of the column: the site shows a name the team chose, and the
	// legal name does not leave the server. Asserting both halves, because
	// showing the alias while still shipping full_name in the JSON would pass
	// a weaker test and leak anyway.
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	alias := "Trung"
	_, err := svc.Create(ctx, id, CreateRequest{FullName: "Le Duc Trung", DisplayName: &alias})
	require.NoError(t, err)

	res, err := svc.ListPublic(ctx, ListParams{})
	require.NoError(t, err)
	require.Equal(t, "Trung", res.Items[0].DisplayName)
	require.Empty(t, res.Items[0].FullName)

	// The console keeps both: an operator has to know who this is.
	list, err := svc.List(ctx, id, ListParams{})
	require.NoError(t, err)
	require.Equal(t, "Le Duc Trung", list.Items[0].FullName)
	require.Equal(t, "Trung", list.Items[0].DisplayName)
}

func TestUpdate_ClearsTheDisplayNameWithAnEmptyString(t *testing.T) {
	// "" is how a form says "I emptied this box". It has to become NULL, not a
	// blank alias: the column's CHECK rejects blanks, and a blank would make
	// the public fallback ambiguous.
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	alias := "Trung"
	m, err := svc.Create(ctx, id, CreateRequest{FullName: "Le Duc Trung", DisplayName: &alias})
	require.NoError(t, err)

	empty := ""
	updated, err := svc.Update(ctx, id, m.ID, UpdateRequest{DisplayName: &empty})
	require.NoError(t, err)
	require.Empty(t, updated.DisplayName)
	require.Nil(t, repo.rows[m.ID].DisplayName, "stored as NULL, not as a blank string")
}

func TestListPublic_IgnoresClientActiveFlag(t *testing.T) {
	// ActiveOnly is forced on regardless of what the caller passed.
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	hidden, err := svc.Create(ctx, id, CreateRequest{FullName: "Hidden"})
	require.NoError(t, err)
	repo.rows[hidden.ID].IsActive = false

	res, err := svc.ListPublic(ctx, ListParams{ActiveOnly: false})
	require.NoError(t, err)
	require.Equal(t, 0, res.Total)
}

func TestGetPublicBySlug_HiddenMemberIs404(t *testing.T) {
	// Whether a hidden profile exists is not public information.
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "Hidden"})
	require.NoError(t, err)
	repo.rows[created.ID].IsActive = false

	_, err = svc.GetPublicBySlug(ctx, "", created.Slug)
	require.Equal(t, 404, status(t, err))
}

func TestGetPublicBySlug_ReturnsActiveMember(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "Public"})
	require.NoError(t, err)

	res, err := svc.GetPublicBySlug(ctx, "", created.Slug)
	require.NoError(t, err)
	require.Equal(t, created.ID, res.ID)
}

// --- Pagination ---

func TestList_ClampsPageSize(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.List(context.Background(), manager(), ListParams{Page: 0, PageSize: 5000})
	require.NoError(t, err)
	require.Equal(t, 1, res.Page)
	require.Equal(t, maxPageSize, res.PageSize)
}

// --- Reorder ---

func TestReorder_RewritesSortOrder(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	a, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)
	b, err := svc.Create(ctx, id, CreateRequest{FullName: "B"})
	require.NoError(t, err)

	require.NoError(t, svc.Reorder(ctx, id, []uuid.UUID{b.ID, a.ID}))
	require.Equal(t, 0, repo.rows[b.ID].SortOrder)
	require.Equal(t, 1, repo.rows[a.ID].SortOrder)
}

func TestReorder_RejectsDuplicateIDs(t *testing.T) {
	svc, _, _ := newSvc(t)
	id := uuid.New()
	err := svc.Reorder(context.Background(), manager(), []uuid.UUID{id, id})
	require.Equal(t, 422, status(t, err))
}

// --- Avatar ---

var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)

func TestUploadAvatar_StoresUnderMemberPrefix(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	res, err := svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.NotNil(t, res.AvatarURL)

	require.Len(t, store.saved, 1)
	for key := range store.saved {
		require.True(t, strings.HasPrefix(key, "members/"+created.ID.String()+"/"),
			"avatar must live under the member's own prefix, got %q", key)
		require.True(t, strings.HasSuffix(key, ".png"))
	}
}

func TestUploadAvatar_RejectsNonImage(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	_, err = svc.UploadAvatar(ctx, id, created.ID, strings.NewReader("<?php echo 1; ?>"))
	require.Equal(t, 415, status(t, err))
	require.Empty(t, store.saved, "a rejected upload must not reach storage")
}

func TestUploadAvatar_RejectsOversizeUpload(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	big := append(append([]byte{}, pngBytes...), bytes.Repeat([]byte{1}, 2<<20)...)
	_, err = svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(big))
	require.Equal(t, 413, status(t, err))
}

func TestUploadAvatar_DeletesPreviousFile(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	_, err = svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	var firstKey string
	for k := range store.saved {
		firstKey = k
	}

	_, err = svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Contains(t, store.deleted, firstKey)
	require.Len(t, store.saved, 1, "only the current avatar should remain")
}

func TestDeleteAvatar_ClearsPathAndFile(t *testing.T) {
	svc, repo, store := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)
	_, err = svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(pngBytes))
	require.NoError(t, err)

	res, err := svc.DeleteAvatar(ctx, id, created.ID)
	require.NoError(t, err)
	require.Nil(t, res.AvatarURL)
	require.Nil(t, repo.rows[created.ID].AvatarPath)
	require.Empty(t, store.saved)
}

// --- Delete ---

func TestDelete_PurgesAvatar(t *testing.T) {
	svc, _, store := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)
	_, err = svc.UploadAvatar(ctx, id, created.ID, bytes.NewReader(pngBytes))
	require.NoError(t, err)

	require.NoError(t, svc.Delete(ctx, id, created.ID))
	require.Empty(t, store.saved)
}

func TestDelete_NotFound(t *testing.T) {
	svc, _, _ := newSvc(t)
	err := svc.Delete(context.Background(), manager(), uuid.New())
	require.Equal(t, 404, status(t, err))
}

// --- Link / URL scheme hardening ---
//
// These values are rendered as <a href> on the public site. The struct
// validator's `url` rule accepts any valid URI, so javascript:/data: payloads
// reach the service — it must be the one to refuse them.

func TestCreate_RejectsDangerousLinkSchemes(t *testing.T) {
	svc, _, _ := newSvc(t)
	for _, raw := range []string{
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		"data:text/html;base64,PHNjcmlwdD4=",
		"file:///etc/passwd",
		"//evil.example/path",
		"/relative/path",
	} {
		_, err := svc.Create(context.Background(), manager(), CreateRequest{
			FullName: "A",
			Links:    []LinkInput{{Label: "X", URL: raw}},
		})
		require.Equal(t, 422, status(t, err), "must reject link url %q", raw)
	}
}

func TestCreate_AcceptsHTTPLinkSchemes(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A",
		Links: []LinkInput{
			{Label: "Site", URL: "http://a.example"},
			{Label: "Secure", URL: "https://b.example/path?q=1"},
		},
	})
	require.NoError(t, err)
	require.Len(t, res.Links, 2)
}

func TestCreate_RejectsDangerousZaloScheme(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A", Zalo: str("javascript:alert(1)"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestUpdate_RejectsDangerousZaloScheme(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	_, err = svc.Update(ctx, id, created.ID, UpdateRequest{Zalo: str("data:text/html,x")})
	require.Equal(t, 422, status(t, err))
}

func TestUpdate_RejectsDangerousLinkScheme(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A"})
	require.NoError(t, err)

	_, err = svc.Update(ctx, id, created.ID, UpdateRequest{
		Links: &[]LinkInput{{Label: "X", URL: "javascript:alert(1)"}},
	})
	require.Equal(t, 422, status(t, err))
}

func TestUpdate_ZaloRoundTrips(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A", Zalo: str("https://zalo.me/123")})
	require.NoError(t, err)
	require.Equal(t, "https://zalo.me/123", *created.Zalo)

	// Absent keeps it; explicit empty clears it.
	kept, err := svc.Update(ctx, id, created.ID, UpdateRequest{Bio: str("x")})
	require.NoError(t, err)
	require.Equal(t, "https://zalo.me/123", *kept.Zalo)

	cleared, err := svc.Update(ctx, id, created.ID, UpdateRequest{Zalo: str("")})
	require.NoError(t, err)
	require.Nil(t, cleared.Zalo)
}

// --- Optional-field clear semantics ---
//
// The console sends "" to mean "clear this field". The struct validator cannot
// express that for formatted fields (omitempty still runs the rule on a pointer
// to ""), so the service owns it.

func TestCreate_EmptyOptionalFieldsAreCleared(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A",
		Role:     str(""),
		Bio:      str(""),
		Email:    str(""),
		Zalo:     str(""),
	})
	require.NoError(t, err)
	require.Nil(t, res.Role)
	require.Nil(t, res.Bio)
	require.Nil(t, res.Email)
	require.Nil(t, res.Zalo)
}

func TestCreate_RejectsMalformedEmail(t *testing.T) {
	svc, _, _ := newSvc(t)
	_, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A", Email: str("not-an-email"),
	})
	require.Equal(t, 422, status(t, err))
}

func TestCreate_AcceptsValidEmail(t *testing.T) {
	svc, _, _ := newSvc(t)
	res, err := svc.Create(context.Background(), manager(), CreateRequest{
		FullName: "A", Email: str(" a@velt.local "),
	})
	require.NoError(t, err)
	require.Equal(t, "a@velt.local", *res.Email)
}

func TestUpdate_EmailClearAndReject(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), manager()
	created, err := svc.Create(ctx, id, CreateRequest{FullName: "A", Email: str("a@velt.local")})
	require.NoError(t, err)

	kept, err := svc.Update(ctx, id, created.ID, UpdateRequest{Bio: str("x")})
	require.NoError(t, err)
	require.Equal(t, "a@velt.local", *kept.Email)

	cleared, err := svc.Update(ctx, id, created.ID, UpdateRequest{Email: str("")})
	require.NoError(t, err)
	require.Nil(t, cleared.Email)

	_, err = svc.Update(ctx, id, created.ID, UpdateRequest{Email: str("nope")})
	require.Equal(t, 422, status(t, err))
}
