package members

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/platform/media"
)

// fakeFiles is a media.BulkRepository over a map, counting its queries: a whole
// roster must cost one lookup.
type fakeFiles struct {
	rows    map[string]media.Record
	queries int
}

func (f *fakeFiles) ByStorageKeys(_ context.Context, keys []string) ([]media.Record, error) {
	f.queries++
	out := make([]media.Record, 0, len(keys))
	for _, k := range keys {
		if r, ok := f.rows[k]; ok {
			out = append(out, r)
		}
	}
	return out, nil
}

func TestPublicRosterCarriesAvatarURLAndSize(t *testing.T) {
	svc, repo, store := newSvc(t)
	backfilled := "members/a/avatar-1.png"
	legacy := "members/b/avatar-2.png"
	files := &fakeFiles{rows: map[string]media.Record{
		backfilled: {Slug: "avatar-9f3c21aa", StorageKey: backfilled, MIME: "image/png", Width: 512, Height: 512},
	}}
	svc.SetMediaURLs(media.NewPublicURLs(files, media.URLs{ImageBase: "https://img.test"}, store))

	ctx := context.Background()
	for _, c := range []struct{ name, slug, path string }{
		{"An", "an", backfilled},
		{"Binh", "binh", legacy},
	} {
		m, err := repo.Create(ctx, write{FullName: c.name, Slug: c.slug, IsActive: true})
		require.NoError(t, err)
		require.NoError(t, repo.UpdateAvatarPath(ctx, m.ID, &c.path))
	}

	res, err := svc.ListPublic(ctx, ListParams{Page: 1, PageSize: 20})
	require.NoError(t, err)
	require.Len(t, res.Items, 2)
	require.Equal(t, 1, files.queries, "the whole roster is one lookup")

	bySlug := map[string]Response{}
	for _, r := range res.Items {
		bySlug[r.Slug] = r
	}
	require.Equal(t, "https://img.test/img/avatar-9f3c21aa.png", *bySlug["an"].AvatarURL)
	require.Equal(t, 512, bySlug["an"].AvatarWidth)
	require.Equal(t, 512, bySlug["an"].AvatarHeight)

	// Not backfilled: the URL this response always sent, and no dimensions.
	require.Equal(t, "/api/files/"+legacy, *bySlug["binh"].AvatarURL)
	require.Zero(t, bySlug["binh"].AvatarWidth)

	// The CONSOLE list reads the same struct and must be untouched by any of it.
	console, err := svc.List(ctx, manager(), ListParams{Page: 1, PageSize: 20})
	require.NoError(t, err)
	for _, r := range console.Items {
		require.Zero(t, r.AvatarWidth)
		if r.AvatarURL != nil {
			require.Contains(t, *r.AvatarURL, "/api/files/")
		}
	}
}
