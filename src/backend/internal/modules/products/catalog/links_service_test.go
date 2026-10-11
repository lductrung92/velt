package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

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

	item, err := svc.AddGalleryImage(ctx, id, p.ID, str("Màn hình chính"), bytes.NewReader(pngBytes))
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

	_, err := svc.AddGalleryImage(ctx, id, p.ID, nil, strings.NewReader("<?php echo 1; ?>"))
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

	a, err := svc.AddGalleryImage(ctx, id, p.ID, str("one"), bytes.NewReader(pngBytes))
	require.NoError(t, err)
	b, err := svc.AddGalleryImage(ctx, id, p.ID, str("two"), bytes.NewReader(pngBytes))
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
	item, err := svc.AddGalleryImage(ctx, id, p.ID, nil, bytes.NewReader(pngBytes))
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
	item, err := svc.AddGalleryImage(ctx, id, p.ID, str("cũ"), bytes.NewReader(pngBytes))
	require.NoError(t, err)

	got, err := svc.UpdateGalleryCaption(ctx, id, p.ID, item.ID, str("mới"))
	require.NoError(t, err)
	require.Equal(t, "mới", *got.Caption)

	cleared, err := svc.UpdateGalleryCaption(ctx, id, p.ID, item.ID, str(""))
	require.NoError(t, err)
	require.Nil(t, cleared.Caption)
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
	_, err = svc.AddGalleryImage(ctx, id, p.ID, nil, bytes.NewReader(pngBytes))
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
