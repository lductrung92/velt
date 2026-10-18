package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
)

// --- Categories ---

func TestSetCategories_ReplacesTheWholeSet(t *testing.T) {
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	a := links.addCategory("Cộng tác", "cong-tac")
	b := links.addCategory("AI", "ai")

	got, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{a.ID, b.ID})
	require.NoError(t, err)
	require.Equal(t, []string{"cong-tac", "ai"}, slugsOf(got))

	// A second call replaces rather than appends.
	got, err = svc.SetCategories(ctx, id, p.ID, []uuid.UUID{b.ID})
	require.NoError(t, err)
	require.Equal(t, []string{"ai"}, slugsOf(got))
}

func TestSetCategories_AcceptsAnEmptyList(t *testing.T) {
	// An uncategorised product is a legitimate state, not an error.
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	c := links.addCategory("Cộng tác", "cong-tac")
	_, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{c.ID})
	require.NoError(t, err)

	got, err := svc.SetCategories(ctx, id, p.ID, nil)
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestSetCategories_IgnoresDuplicates(t *testing.T) {
	// The same category twice means the same thing once — no reason to error.
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	c := links.addCategory("Cộng tác", "cong-tac")

	got, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{c.ID, c.ID})
	require.NoError(t, err)
	require.Len(t, got, 1)
}

func TestSetCategories_RejectsAnUnknownCategory(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{uuid.New()})
	require.Equal(t, 422, status(t, err))
}

func TestSetCategories_RequiresEditPermission(t *testing.T) {
	svc, _, _, links := newSvcWithLinks(t)
	ctx := context.Background()
	p := create(t, svc, author(), CreateRequest{Name: "A"})
	c := links.addCategory("Cộng tác", "cong-tac")
	viewer := &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView}}

	_, err := svc.SetCategories(ctx, viewer, p.ID, []uuid.UUID{c.ID})
	require.Equal(t, 403, status(t, err))
}

// --- Members ---

func TestSetMembers_KeepsOrderAndPerProductRole(t *testing.T) {
	// The role lives on the link, not the person: the same member can hold a
	// different role on another product.
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p1 := create(t, svc, id, CreateRequest{Name: "A"})
	p2 := create(t, svc, id, CreateRequest{Name: "B"})
	m := links.addMember("An Nguyễn", "an-nguyen")
	n := links.addMember("Bình Trần", "binh-tran")

	got, err := svc.SetMembers(ctx, id, p1.ID, []MemberLinkInput{
		{MemberID: n.ID, Role: str("Thiết kế")},
		{MemberID: m.ID, Role: str("Backend")},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"binh-tran", "an-nguyen"}, memberSlugs(got))
	require.Equal(t, 0, got[0].SortOrder)
	require.Equal(t, 1, got[1].SortOrder)

	got2, err := svc.SetMembers(ctx, id, p2.ID, []MemberLinkInput{
		{MemberID: m.ID, Role: str("Quản lý dự án")},
	})
	require.NoError(t, err)
	require.Equal(t, "Quản lý dự án", *got2[0].Role)

	// The first product's role is untouched.
	again, err := svc.SetMembers(ctx, id, p1.ID, []MemberLinkInput{
		{MemberID: m.ID, Role: str("Backend")},
	})
	require.NoError(t, err)
	require.Equal(t, "Backend", *again[0].Role)
}

func TestSetMembers_BlankRoleBecomesNull(t *testing.T) {
	// Empty means "use their general role", which the site reads as absent.
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	m := links.addMember("An", "an")

	got, err := svc.SetMembers(ctx, id, p.ID, []MemberLinkInput{
		{MemberID: m.ID, Role: str("   ")},
	})
	require.NoError(t, err)
	require.Nil(t, got[0].Role)
}

func TestSetMembers_RejectsDuplicateMember(t *testing.T) {
	// Unlike categories this is ambiguous — which of the two roles wins? — so
	// the client has to resolve it.
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	m := links.addMember("An", "an")

	_, err := svc.SetMembers(ctx, id, p.ID, []MemberLinkInput{
		{MemberID: m.ID, Role: str("Backend")},
		{MemberID: m.ID, Role: str("Thiết kế")},
	})
	require.Equal(t, 422, status(t, err))
}

func TestSetMembers_RejectsAnUnknownMember(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.SetMembers(ctx, id, p.ID, []MemberLinkInput{{MemberID: uuid.New()}})
	require.Equal(t, 422, status(t, err))
}

// --- Gallery ---

func TestAddGalleryImage_StoresTheFileAndTheRow(t *testing.T) {
	svc, _, store, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	item, err := svc.AddGalleryImage(ctx, id, p.ID, str("Màn hình chính"), nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Equal(t, MediaImage, item.Kind)
	require.NotNil(t, item.URL)
	require.Equal(t, "Màn hình chính", *item.Caption)
	require.Len(t, store.saved, 1)
	for k := range store.saved {
		require.True(t, strings.HasPrefix(k, "products/"+p.ID.String()+"/gallery-"))
	}
}

func TestAddGalleryImage_RejectsNonImageWithoutStoringAnything(t *testing.T) {
	svc, _, store, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	_, err := svc.AddGalleryImage(ctx, id, p.ID, nil, nil, strings.NewReader("<?php echo 1; ?>"))
	require.Equal(t, 415, status(t, err))
	require.Empty(t, store.saved)
}

func TestAddGalleryVideo_AcceptsOnlyEmbeddableHosts(t *testing.T) {
	// The URL goes straight into an <iframe src> on the public site.
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	for _, ok := range []string{
		"https://www.youtube.com/watch?v=abc",
		"https://youtu.be/abc",
		"https://player.vimeo.com/video/123",
	} {
		_, err := svc.AddGalleryVideo(ctx, id, p.ID, AddVideoRequest{VideoURL: ok})
		require.NoError(t, err, "must accept %q", ok)
	}
	for _, bad := range []string{
		"https://evil.example/embed",
		"http://www.youtube.com/watch?v=abc", // not https
		"javascript:alert(1)",
		"//www.youtube.com/watch?v=abc",
	} {
		_, err := svc.AddGalleryVideo(ctx, id, p.ID, AddVideoRequest{VideoURL: bad})
		require.Equal(t, 422, status(t, err), "must reject %q", bad)
	}
}

func TestGallery_AppendsInOrderAndReorders(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	a, err := svc.AddGalleryImage(ctx, id, p.ID, str("one"), nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	b, err := svc.AddGalleryImage(ctx, id, p.ID, str("two"), nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Equal(t, 0, a.SortOrder)
	require.Equal(t, 1, b.SortOrder)

	got, err := svc.ReorderGallery(ctx, id, p.ID, []uuid.UUID{b.ID, a.ID})
	require.NoError(t, err)
	require.Equal(t, []string{"two", "one"}, captionsOf(got))
}

func TestReorderGallery_RejectsDuplicateIDs(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	mid := uuid.New()

	_, err := svc.ReorderGallery(ctx, id, p.ID, []uuid.UUID{mid, mid})
	require.Equal(t, 422, status(t, err))
}

func TestDeleteGalleryItem_RemovesTheRowAndTheFile(t *testing.T) {
	svc, _, store, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	item, err := svc.AddGalleryImage(ctx, id, p.ID, nil, nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)

	require.NoError(t, svc.DeleteGalleryItem(ctx, id, p.ID, item.ID))
	require.Empty(t, store.saved)
	got, err := svc.Gallery(ctx, id, p.ID)
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestDeleteGalleryItem_LeavesNoFileForAVideo(t *testing.T) {
	svc, _, store, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	item, err := svc.AddGalleryVideo(ctx, id, p.ID, AddVideoRequest{
		VideoURL: "https://youtu.be/abc",
	})
	require.NoError(t, err)

	require.NoError(t, svc.DeleteGalleryItem(ctx, id, p.ID, item.ID))
	require.Empty(t, store.deleted, "a video has no stored file to reclaim")
}

func TestUpdateGalleryCaption(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	item, err := svc.AddGalleryImage(ctx, id, p.ID, str("cũ"), nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)

	got, err := svc.UpdateGalleryItem(ctx, id, p.ID, item.ID,
		UpdateMediaRequest{Caption: str("mới"), Device: str(DeviceTablet)})
	require.NoError(t, err)
	require.Equal(t, "mới", *got.Caption)
	require.Equal(t, DeviceTablet, *got.Device)

	// The request carries the whole editable state, so a field left out is
	// cleared — that is how a screenshot goes back to "unassigned".
	cleared, err := svc.UpdateGalleryItem(ctx, id, p.ID, item.ID,
		UpdateMediaRequest{Caption: str("")})
	require.NoError(t, err)
	require.Nil(t, cleared.Caption)
	require.Nil(t, cleared.Device)
}

// --- Detail + snapshot ---

func TestGet_IncludesRelations(t *testing.T) {
	svc, _, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	c := links.addCategory("Cộng tác", "cong-tac")
	m := links.addMember("An", "an")
	_, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{c.ID})
	require.NoError(t, err)
	_, err = svc.SetMembers(ctx, id, p.ID, []MemberLinkInput{{MemberID: m.ID, Role: str("Backend")}})
	require.NoError(t, err)
	_, err = svc.AddGalleryImage(ctx, id, p.ID, nil, nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)

	got, err := svc.Get(ctx, id, p.ID)
	require.NoError(t, err)
	require.Len(t, got.Categories, 1)
	require.Len(t, got.Members, 1)
	require.Len(t, got.Gallery, 1)
}

func TestGet_RelationsAreEmptySlicesNotNull(t *testing.T) {
	// The client should never have to tell "none" from "not loaded".
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	got, err := svc.Get(ctx, id, p.ID)
	require.NoError(t, err)
	require.NotNil(t, got.Categories)
	require.NotNil(t, got.Members)
	require.NotNil(t, got.Gallery)
}

func TestPublish_SnapshotFreezesTheRelationsToo(t *testing.T) {
	// Without this the public page would lose its categories, people and
	// gallery the moment it was published.
	svc, repo, _, links := newSvcWithLinks(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	c := links.addCategory("Cộng tác", "cong-tac")
	m := links.addMember("An", "an")
	_, err := svc.SetCategories(ctx, id, p.ID, []uuid.UUID{c.ID})
	require.NoError(t, err)
	_, err = svc.SetMembers(ctx, id, p.ID, []MemberLinkInput{{MemberID: m.ID, Role: str("Backend")}})
	require.NoError(t, err)

	_, err = svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	var snap Response
	require.NoError(t, json.Unmarshal(repo.rows[p.ID].PublishedSnapshot, &snap))
	require.Equal(t, "cong-tac", snap.Categories[0].Slug)
	require.Equal(t, "Backend", *snap.Members[0].Role)
}

// --- helpers ---

func slugsOf(in []CategoryRef) []string {
	out := make([]string, 0, len(in))
	for _, c := range in {
		out = append(out, c.Slug)
	}
	return out
}

func memberSlugs(in []MemberRef) []string {
	out := make([]string, 0, len(in))
	for _, m := range in {
		out = append(out, m.Slug)
	}
	return out
}

func captionsOf(in []MediaItem) []string {
	out := make([]string, 0, len(in))
	for _, m := range in {
		if m.Caption != nil {
			out = append(out, *m.Caption)
		}
	}
	return out
}

func TestGalleryDevice_UploadLandsInTheTabItWasDroppedInto(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})

	phone, err := svc.AddGalleryImage(ctx, id, p.ID, nil, str(DevicePhone), bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Equal(t, DevicePhone, *phone.Device)

	// No tab chosen is a real state, not a default: the console shows those
	// in their own pile until somebody files them.
	loose, err := svc.AddGalleryImage(ctx, id, p.ID, nil, nil, bytes.NewReader(pngBytes))
	require.NoError(t, err)
	require.Nil(t, loose.Device)
}

func TestGalleryDevice_RejectsAValueTheColumnWouldRefuse(t *testing.T) {
	// The multipart upload has no struct tag to validate it, so the handler
	// checks the value itself; this is that check. Without it a typo reaches
	// the CHECK constraint and comes back as a 500.
	require.True(t, validDevice(DevicePhone))
	require.True(t, validDevice(DeviceTablet))
	require.True(t, validDevice(DeviceDesktop))
	require.False(t, validDevice("laptop"), "laptop shares the desktop tab")
	require.False(t, validDevice("Phone"))
	require.False(t, validDevice(""))
}

func TestUpdateMediaRequest_AcceptsWhatTheConsoleSends(t *testing.T) {
	// The decoder rejects unknown fields (httpx.DecodeAndValidate), so a body
	// carrying `device` against a server that does not know the field comes
	// back as a flat 400 bad_request with no details — which is exactly what
	// a stale local binary looked like. This pins the contract.
	decode := func(body string) (UpdateMediaRequest, error) {
		var req UpdateMediaRequest
		r := httptest.NewRequest(http.MethodPatch, "/x", strings.NewReader(body))
		return req, httpx.DecodeAndValidate(r, &req)
	}

	req, err := decode(`{"caption":"Màn hình chính","device":"tablet"}`)
	require.NoError(t, err)
	require.Equal(t, "Màn hình chính", *req.Caption)
	require.Equal(t, DeviceTablet, *req.Device)

	// Unfiling a screenshot: both fields explicitly null.
	req, err = decode(`{"caption":null,"device":null}`)
	require.NoError(t, err)
	require.Nil(t, req.Caption)
	require.Nil(t, req.Device)

	// laptop shares the desktop tab, so it is not a value the API takes.
	_, err = decode(`{"caption":null,"device":"laptop"}`)
	ae, ok := apperr.As(err)
	require.True(t, ok)
	require.Equal(t, http.StatusUnprocessableEntity, ae.Status)
}

func TestGalleryHero_OnePerDevice(t *testing.T) {
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	add := func(device string) MediaItem {
		m, err := svc.AddGalleryImage(ctx, id, p.ID, nil, str(device), bytes.NewReader(pngBytes))
		require.NoError(t, err)
		return m
	}
	phone1, phone2, desk := add(DevicePhone), add(DevicePhone), add(DeviceDesktop)

	promote := func(m MediaItem, device string) {
		_, err := svc.UpdateGalleryItem(ctx, id, p.ID, m.ID,
			UpdateMediaRequest{Device: str(device), IsHero: boolp(true)})
		require.NoError(t, err)
	}
	heroes := func() map[uuid.UUID]bool {
		all, err := svc.Gallery(ctx, id, p.ID)
		require.NoError(t, err)
		out := map[uuid.UUID]bool{}
		for _, m := range all {
			out[m.ID] = m.IsHero
		}
		return out
	}

	promote(phone1, DevicePhone)
	promote(desk, DeviceDesktop)
	require.True(t, heroes()[phone1.ID])
	require.True(t, heroes()[desk.ID], "moi thiet bi co hero rieng")

	// Promoting the other phone capture moves the flag within the phone tab
	// and leaves the desktop hero alone.
	promote(phone2, DevicePhone)
	got := heroes()
	require.False(t, got[phone1.ID])
	require.True(t, got[phone2.ID])
	require.True(t, got[desk.ID], "doi hero dien thoai khong duoc dung toi desktop")
}

func TestGalleryHero_CaptionEditLeavesTheFlagAlone(t *testing.T) {
	// The caption field and the hero checkbox are edited from different places
	// in the console; a caption save must not un-feature the picture.
	svc, _, _, _ := newSvcWithLinks(t)
	ctx, id := context.Background(), author()
	p := create(t, svc, id, CreateRequest{Name: "A"})
	m, err := svc.AddGalleryImage(ctx, id, p.ID, nil, str(DevicePhone), bytes.NewReader(pngBytes))
	require.NoError(t, err)
	_, err = svc.UpdateGalleryItem(ctx, id, p.ID, m.ID,
		UpdateMediaRequest{Device: str(DevicePhone), IsHero: boolp(true)})
	require.NoError(t, err)

	after, err := svc.UpdateGalleryItem(ctx, id, p.ID, m.ID,
		UpdateMediaRequest{Caption: str("Màn hình chính"), Device: str(DevicePhone)})
	require.NoError(t, err)
	require.True(t, after.IsHero)
	require.Equal(t, "Màn hình chính", *after.Caption)
}
