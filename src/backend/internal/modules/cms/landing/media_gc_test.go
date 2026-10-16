package landing

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func newFakeStoreWith(keys ...string) *cmstest.FakeStore {
	st := cmstest.NewFakeStore()
	for _, k := range keys {
		st.Saved[k] = []byte("x")
	}
	return st
}

func TestSnapshotMediaPaths_NestedAndTopLevel(t *testing.T) {
	snap := json.RawMessage(`{
		"og_path":"cms/landing/l1/og.jpg",
		"sections":[
			{"type":"hero","config":{"image_path":"cms/landing/l1/hero.jpg","heading":"H"}},
			{"type":"slider","config":{"slides":[{"image_path":"cms/landing/l1/s1.jpg"},{"heading":"no-img"}]}},
			{"type":"stats","config":{"items":[{"value":"1","label":"a"}]}}
		]
	}`)
	got := snapshotMediaPaths(snap)
	require.Len(t, got, 3)
	require.Contains(t, got, "cms/landing/l1/og.jpg")
	require.Contains(t, got, "cms/landing/l1/hero.jpg") // nested section config
	require.Contains(t, got, "cms/landing/l1/s1.jpg")   // nested inside slides[]
}

func TestSnapshotMediaPaths_EmptyOrInvalid(t *testing.T) {
	require.Empty(t, snapshotMediaPaths(nil))
	require.Empty(t, snapshotMediaPaths(json.RawMessage(`not json`)))
}

func TestGcDroppedMedia_DeletesOnlyDropped(t *testing.T) {
	st := newFakeStoreWith(
		"cms/landing/l1/hero-old.jpg",
		"cms/landing/l1/hero-new.jpg",
		"cms/landing/l1/kept.jpg",
	)
	oldSnap := json.RawMessage(`{"sections":[{"config":{"image_path":"cms/landing/l1/hero-old.jpg"}},{"config":{"image_path":"cms/landing/l1/kept.jpg"}}]}`)
	newSnap := json.RawMessage(`{"sections":[{"config":{"image_path":"cms/landing/l1/hero-new.jpg"}},{"config":{"image_path":"cms/landing/l1/kept.jpg"}}]}`)

	gcDroppedMedia(context.Background(), st, nil, "cms/landing/l1/", oldSnap, snapshotMediaPaths(newSnap))

	require.NotContains(t, st.Saved, "cms/landing/l1/hero-old.jpg") // dropped → deleted
	require.Contains(t, st.Saved, "cms/landing/l1/hero-new.jpg")    // newly added → kept
	require.Contains(t, st.Saved, "cms/landing/l1/kept.jpg")        // still referenced → kept
}

func TestGcDroppedMedia_FirstPublishKeepsEverything(t *testing.T) {
	st := newFakeStoreWith("cms/landing/l1/hero.jpg")
	newSnap := json.RawMessage(`{"sections":[{"config":{"image_path":"cms/landing/l1/hero.jpg"}}]}`)
	// no previous snapshot
	gcDroppedMedia(context.Background(), st, nil, "cms/landing/l1/", nil, snapshotMediaPaths(newSnap))
	require.Contains(t, st.Saved, "cms/landing/l1/hero.jpg")
}

// B2 regression: hiding a section then republishing must NOT delete its image —
// the section still references it, it's just excluded from the public snapshot.
func TestGcDroppedMedia_KeepsHiddenSectionMedia(t *testing.T) {
	st := newFakeStoreWith("cms/landing/l1/hidden.jpg")
	// hidden.jpg WAS in the old (published) snapshot…
	oldSnap := json.RawMessage(`{"sections":[{"config":{"image_path":"cms/landing/l1/hidden.jpg"}}]}`)
	// …but the section is now hidden, so the new snapshot omits it.
	newSnap := json.RawMessage(`{"sections":[]}`)
	// The current sections list still carries the (hidden) section referencing it.
	sections := []Section{{Config: json.RawMessage(`{"image_path":"cms/landing/l1/hidden.jpg"}`), IsVisible: false}}

	gcDroppedMedia(context.Background(), st, nil, "cms/landing/l1/", oldSnap,
		liveMediaPaths(newSnap, sections, nil))

	require.Contains(t, st.Saved, "cms/landing/l1/hidden.jpg") // still referenced → kept
}

// Defense-in-depth: GC never deletes a path outside the landing's own prefix,
// even if it dropped out of the snapshot.
func TestGcDroppedMedia_SkipsOutsidePrefix(t *testing.T) {
	st := newFakeStoreWith("customers/x/passport.pdf")
	oldSnap := json.RawMessage(`{"sections":[{"config":{"image_path":"customers/x/passport.pdf"}}]}`)
	newSnap := json.RawMessage(`{"sections":[]}`)
	gcDroppedMedia(context.Background(), st, nil, "cms/landing/l1/", oldSnap, snapshotMediaPaths(newSnap))
	require.Contains(t, st.Saved, "customers/x/passport.pdf") // outside prefix → untouched
}

func TestPagesPort_Delete_PurgesMediaFolder(t *testing.T) {
	e := newTestSvc(t)
	l := mkLanding(t, e, "home")
	base := "cms/landing/" + l.ID.String() + "/"
	e.store.Saved[base+"hero.jpg"] = []byte("x")
	e.store.Saved[base+"og.jpg"] = []byte("x")
	e.store.Saved["cms/landing/other/keep.jpg"] = []byte("x") // another landing

	port := NewPagesPort(e.repo, e.store)
	require.NoError(t, port.Delete(context.Background(), l.ID))

	require.NotContains(t, e.store.Saved, base+"hero.jpg")
	require.NotContains(t, e.store.Saved, base+"og.jpg")
	require.Contains(t, e.store.Saved, "cms/landing/other/keep.jpg")
}
