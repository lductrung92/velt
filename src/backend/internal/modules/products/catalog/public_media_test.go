package catalog

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/products/shared"
	"github.com/velt/backend/internal/platform/media"
)

// fakeFiles is a media.BulkRepository over a map, counting its queries.
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

// legacyURLer is the storage.URLer the frozen snapshots were rendered through.
type legacyURLer struct{}

func (legacyURLer) URL(_ context.Context, key string) string { return "/api/files/" + key }

func imageRow(key, slug string, w, h int) media.Record {
	return media.Record{Slug: slug, StorageKey: key, MIME: "image/png", Width: w, Height: h}
}

func mediaEnv(t *testing.T, rows map[string]media.Record) (*publicEnv, *fakeFiles) {
	t.Helper()
	repo := &fakePublicRepo{docs: map[string]*PublishedProduct{}}
	svc := NewPublicService(shared.NewBase(nil), repo, legacyURLer{})
	files := &fakeFiles{rows: rows}
	svc.SetMediaURLs(media.NewPublicURLs(files, media.URLs{ImageBase: "https://img.test"}, legacyURLer{}))
	return &publicEnv{repo: repo, svc: svc}, files
}

func TestPublicDetailUpgradesEveryImageInOneQuery(t *testing.T) {
	env, files := mediaEnv(t, map[string]media.Record{
		"products/p1/cover.png": imageRow("products/p1/cover.png", "cover-11111111", 2400, 1350),
		"products/p1/og.png":    imageRow("products/p1/og.png", "og-22222222", 1200, 630),
		"products/p1/g1.png":    imageRow("products/p1/g1.png", "gallery-33333333", 800, 600),
	})
	full := sampleResponse()
	avatar := "/api/files/users/u1/avatar.png"
	full.Members[0].AvatarURL = &avatar

	out := env.svc.toPublicDetail(context.Background(), full, baseLocale, nil)
	require.Equal(t, 1, files.queries, "cover, OG, gallery and avatars are one lookup")

	require.Equal(t, "https://img.test/img/cover-11111111.png", *out.CoverURL)
	require.Equal(t, 2400, out.CoverWidth)
	require.Equal(t, 1350, out.CoverHeight)

	require.Equal(t, "https://img.test/img/og-22222222.png", *out.SEO.OGImageURL)
	require.Equal(t, 1200, out.SEO.OGImageWidth)
	require.Equal(t, 630, out.SEO.OGImageHeight)

	require.Equal(t, "https://img.test/img/gallery-33333333.png", *out.Gallery[0].URL)
	require.Equal(t, 800, out.Gallery[0].Width)
	require.Equal(t, 600, out.Gallery[0].Height)

	// The avatar has no row: the frozen URL survives untouched and says nothing
	// about its size.
	require.Equal(t, avatar, *out.Members[0].AvatarURL)
	require.Zero(t, out.Members[0].AvatarWidth)
}

func TestPublicListUpgradesCoversInOneQuery(t *testing.T) {
	const key = "products/p1/cover.png"
	bodies := make([]json.RawMessage, 0, 20)
	for range 20 {
		bodies = append(bodies, snapshotOf(t, sampleResponse()))
	}

	env, files := mediaEnv(t, map[string]media.Record{
		key: imageRow(key, "cover-11111111", 1920, 1080),
	})
	env.repo.bodies = bodies
	env.repo.total = len(bodies)

	res, err := env.svc.List(context.Background(), PublicListParams{})
	require.NoError(t, err)
	require.Len(t, res.Items, 20)
	require.Equal(t, 1, files.queries, "20 products must not become 20 queries")
	for _, it := range res.Items {
		require.Equal(t, "https://img.test/img/cover-11111111.png", *it.CoverURL)
		require.Equal(t, 1920, it.CoverWidth)
		require.Equal(t, 1080, it.CoverHeight)
	}
}
