package shared_test

import (
	"context"
	"io"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/platform/storage"
)

func strptr(s string) *string { return &s }

func TestPurgeMediaTree_RemovesPrefixOnly(t *testing.T) {
	st := cmstest.NewFakeStore()
	st.Saved["cms/articles/a1/f.jpg"] = []byte("x")
	st.Saved["cms/articles/a1/og.jpg"] = []byte("x")
	st.Saved["cms/articles/a2/keep.jpg"] = []byte("x") // different entity
	st.Saved["cms/landing/l1/hero.jpg"] = []byte("x")  // different module

	require.NoError(t, shared.PurgeMediaTree(context.Background(), st, nil, "cms/articles/a1/"))

	_, gone1 := st.Saved["cms/articles/a1/f.jpg"]
	_, gone2 := st.Saved["cms/articles/a1/og.jpg"]
	require.False(t, gone1)
	require.False(t, gone2)
	require.Contains(t, st.Saved, "cms/articles/a2/keep.jpg")
	require.Contains(t, st.Saved, "cms/landing/l1/hero.jpg")
}

// noTreeStore is a storage.Storage WITHOUT DeleteTree — PurgeMediaTree must
// degrade to a no-op rather than fail (some drivers/stubs lack recursive delete).
type noTreeStore struct{ deleted []string }

func (*noTreeStore) Save(context.Context, string, io.Reader) error { return nil }
func (*noTreeStore) Open(context.Context, string) (io.ReadCloser, error) {
	return nil, storage.ErrInvalidPath
}
func (s *noTreeStore) Delete(_ context.Context, k string) error {
	s.deleted = append(s.deleted, k)
	return nil
}
func (*noTreeStore) URL(_ context.Context, k string) string { return k }

func TestPurgeMediaTree_NoopWithoutTreeSupport(t *testing.T) {
	require.NoError(t, shared.PurgeMediaTree(context.Background(), &noTreeStore{}, nil, "cms/articles/a1/"))
}

func TestDeleteOldMedia(t *testing.T) {
	ctx := context.Background()
	const prefix = "cms/a/1/"
	cases := []struct {
		name       string
		old, newP  *string
		wantDelete string // "" = expect no delete
	}{
		{"replaced", strptr("cms/a/1/old.jpg"), strptr("cms/a/1/new.jpg"), "cms/a/1/old.jpg"},
		{"cleared_to_nil", strptr("cms/a/1/old.jpg"), nil, "cms/a/1/old.jpg"},
		{"cleared_to_empty", strptr("cms/a/1/old.jpg"), strptr(""), "cms/a/1/old.jpg"},
		{"unchanged", strptr("cms/a/1/same.jpg"), strptr("cms/a/1/same.jpg"), ""},
		{"was_empty", nil, strptr("cms/a/1/new.jpg"), ""},
		// defense-in-depth: an old path outside the entity's prefix (spoofed) is
		// never deleted, even when cleared.
		{"outside_prefix_not_deleted", strptr("customers/x/passport.pdf"), strptr(""), ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			st := &noTreeStore{}
			shared.DeleteOldMedia(ctx, st, nil, prefix, c.old, c.newP)
			if c.wantDelete == "" {
				require.Empty(t, st.deleted)
			} else {
				require.Equal(t, []string{c.wantDelete}, st.deleted)
			}
		})
	}
}

func TestOwnsMedia(t *testing.T) {
	const prefix = "cms/articles/a1/"
	require.True(t, shared.OwnsMedia(prefix, ""))                          // empty = owned (no media)
	require.True(t, shared.OwnsMedia(prefix, "cms/articles/a1/f.jpg"))     // under prefix
	require.False(t, shared.OwnsMedia(prefix, "cms/articles/a2/f.jpg"))    // other entity
	require.False(t, shared.OwnsMedia(prefix, "customers/x/passport.pdf")) // other zone
}
