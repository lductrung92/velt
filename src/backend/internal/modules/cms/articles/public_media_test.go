package articles

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/platform/media"
)

// fakeFiles is a media.BulkRepository over a map, counting its queries: the
// read-path mapping must cost ONE lookup per response however long the list is.
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

func publicSvcWithMedia(repo publicReader, rows map[string]media.Record) (*PublicService, *fakeFiles) {
	store := cmstest.NewFakeStore()
	files := &fakeFiles{rows: rows}
	svc := NewPublicService(repo, store)
	svc.SetMediaURLs(media.NewPublicURLs(files, media.URLs{ImageBase: "https://img.test"}, store))
	return svc, files
}

func TestPublicList_CoverCarriesMediaURLAndSize(t *testing.T) {
	backfilled := "cms/articles/a/featured-1.png"
	legacy := "cms/articles/b/featured-2.png"
	repo := &fakePublicRepo{
		cards: []PublicCard{
			{Slug: "a", Title: "A", FeaturedPath: &backfilled},
			{Slug: "b", Title: "B", FeaturedPath: &legacy},
			{Slug: "c", Title: "C"},
		},
		total: 3,
	}
	svc, files := publicSvcWithMedia(repo, map[string]media.Record{
		backfilled: {Slug: "featured-9f3c21aa", StorageKey: backfilled, MIME: "image/png", Width: 2400, Height: 1600},
	})

	res, err := svc.ListPublished(context.Background(), "", "", "", 1, 10)
	require.NoError(t, err)
	require.Equal(t, 1, files.queries, "the whole page is one lookup")

	// Backfilled: the flat image URL, plus the size the site reserves space with.
	require.Equal(t, "https://img.test/img/featured-9f3c21aa.png", *res.Items[0].CoverURL)
	require.Equal(t, 2400, res.Items[0].CoverWidth)
	require.Equal(t, 1600, res.Items[0].CoverHeight)

	// Not backfilled: exactly what this response said before, and no dimensions.
	require.Equal(t, "https://cdn.test/"+legacy, *res.Items[1].CoverURL)
	require.Zero(t, res.Items[1].CoverWidth)
	require.Zero(t, res.Items[1].CoverHeight)

	// No cover at all: still nil, still not a 500.
	require.Nil(t, res.Items[2].CoverURL)
}

func TestPublicDetail_CoverCarriesMediaURLAndSize(t *testing.T) {
	path := "cms/articles/a/featured-1.png"
	repo := &fakePublicRepo{bySlug: map[string]*PublicArticle{
		"a": {Slug: "a", Title: "A", FeaturedPath: &path},
	}}
	svc, _ := publicSvcWithMedia(repo, map[string]media.Record{
		path: {Slug: "featured-9f3c21aa", StorageKey: path, MIME: "image/png", Width: 1200, Height: 900},
	})

	got, err := svc.GetBySlug(context.Background(), "", "a")
	require.NoError(t, err)
	require.Equal(t, "https://img.test/img/featured-9f3c21aa.png", *got.CoverURL)
	require.Equal(t, 1200, got.CoverWidth)
	require.Equal(t, 900, got.CoverHeight)
}

func TestPublicList_WithoutTheMappingIsUnchanged(t *testing.T) {
	// The mapping is wired at startup; a deployment without it must answer
	// exactly as it did before the `files` table existed.
	path := "cms/articles/a/featured-1.png"
	repo := &fakePublicRepo{cards: []PublicCard{{Slug: "a", Title: "A", FeaturedPath: &path}}, total: 1}
	res, err := NewPublicService(repo, cmstest.NewFakeStore()).
		ListPublished(context.Background(), "", "", "", 1, 10)
	require.NoError(t, err)
	require.Equal(t, "https://cdn.test/"+path, *res.Items[0].CoverURL)
	require.Zero(t, res.Items[0].CoverWidth)
}
