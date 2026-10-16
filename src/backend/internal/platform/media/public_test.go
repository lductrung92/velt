package media

import (
	"context"
	"fmt"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
)

// bulkRepo is a BulkRepository over a map that counts how many times it was
// asked — the whole point of the bulk shape is that the answer is 1.
type bulkRepo struct {
	rows    map[string]Record
	queries int
	keys    []string
	err     error
}

func (b *bulkRepo) ByStorageKeys(_ context.Context, keys []string) ([]Record, error) {
	b.queries++
	b.keys = keys
	if b.err != nil {
		return nil, b.err
	}
	out := make([]Record, 0, len(keys))
	for _, k := range keys {
		if r, ok := b.rows[k]; ok {
			out = append(out, r)
		}
	}
	return out, nil
}

// legacyURLer is the URL builder the stored columns were rendered through.
type legacyURLer string

func (l legacyURLer) URL(_ context.Context, key string) string { return string(l) + key }

func imageRow(key, slug string, w, h int) Record {
	return Record{
		Slug: slug, StorageKey: key, MIME: "image/png",
		SHA256: "f0", Width: w, Height: h,
	}
}

func TestPublicResolveIsOneQueryForAWholePage(t *testing.T) {
	rows := map[string]Record{}
	values := make([]string, 0, 40)
	for i := range 20 {
		key := fmt.Sprintf("products/p%d/cover-1.png", i)
		rows[key] = imageRow(key, "cover-0000000"+strconv.Itoa(i%10), 1600, 900)
		// Each value twice: a list that repeats an image must not pay twice.
		values = append(values, "/api/files/"+key, "/api/files/"+key)
	}
	repo := &bulkRepo{rows: rows}
	p := NewPublicURLs(repo, URLs{ImageBase: "https://img.zukatek.vn"}, legacyURLer("/api/files/"))

	found := p.Resolve(context.Background(), values)
	require.Len(t, found, 20)
	require.Equal(t, 1, repo.queries, "20 products are one query, not 20")
	require.Len(t, repo.keys, 20, "repeated keys are asked for once")

	got := found["/api/files/products/p3/cover-1.png"]
	require.Equal(t, "https://img.zukatek.vn/img/cover-00000003.png", got.URL)
	require.Equal(t, 1600, got.Width)
	require.Equal(t, 900, got.Height)
}

func TestPublicResolveLeavesUnknownValuesAlone(t *testing.T) {
	key := "cms/articles/a/featured-1.png"
	repo := &bulkRepo{rows: map[string]Record{key: imageRow(key, "featured-9f3c21aa", 800, 600)}}
	p := NewPublicURLs(repo, URLs{}, legacyURLer("https://cdn.test/"))

	found := p.Resolve(context.Background(), []string{
		"https://cdn.test/" + key,               // ours, backfilled
		"https://cdn.test/cms/articles/a/x.png", // ours, no row yet
		"https://example.com/somebody-else.png", // not ours at all
		"",                                      // nothing at all
	})
	require.Len(t, found, 1)
	require.Contains(t, found, "https://cdn.test/"+key)
	// Everything else is ABSENT, which is what tells the caller to send the
	// field exactly as it already had it and no dimensions.
	require.NotContains(t, found, "https://cdn.test/cms/articles/a/x.png")
	require.NotContains(t, found, "https://example.com/somebody-else.png")
	// An external URL is never even asked about.
	require.Equal(t, []string{key, "cms/articles/a/x.png"}, repo.keys)
}

func TestPublicResolveSkipsRowsWithNoPixels(t *testing.T) {
	// A PDF has a row and a slug, but no /img rendering and no size to send —
	// so an image field pointing at one is left as it is.
	key := "cms/articles/a/report-1.pdf"
	repo := &bulkRepo{rows: map[string]Record{
		key: {Slug: "report-12345678", StorageKey: key, MIME: "application/pdf", SHA256: "f0"},
	}}
	p := NewPublicURLs(repo, URLs{}, legacyURLer("/api/files/"))
	require.Empty(t, p.Resolve(context.Background(), []string{"/api/files/" + key}))
}

func TestPublicResolveSurvivesABrokenQuery(t *testing.T) {
	// A failed lookup must never blank an image: the caller sees an empty map
	// and keeps the URL it already had.
	repo := &bulkRepo{err: context.DeadlineExceeded}
	p := NewPublicURLs(repo, URLs{}, legacyURLer("/api/files/"))
	require.Empty(t, p.Resolve(context.Background(), []string{"/api/files/a/b.png"}))

	// And neither does having no mapping wired at all.
	var unwired *PublicURLs
	require.Empty(t, unwired.Resolve(context.Background(), []string{"/api/files/a/b.png"}))
}

func TestPublicApplyRewritesOnlyWhatItFound(t *testing.T) {
	legacy := "/api/files/a/b.png"
	field := &legacy
	w, h := Apply(map[string]Image{legacy: {URL: "/img/b-00000000.png", Width: 4, Height: 2}}, &field)
	require.Equal(t, "/img/b-00000000.png", *field)
	require.Equal(t, 4, w)
	require.Equal(t, 2, h)

	other := "/api/files/c/d.png"
	field = &other
	w, h = Apply(nil, &field)
	require.Equal(t, "/api/files/c/d.png", *field, "an unknown field keeps its URL")
	require.Zero(t, w)
	require.Zero(t, h)
}
