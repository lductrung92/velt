package articles

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/media"
)

// fakeKeeper is a media.Keeper over a map: it remembers what was minted, what
// was forgotten, and answers the bulk lookup the inline GC now relies on.
type fakeKeeper struct {
	rows      map[string]media.Record // storage key -> row
	forgotten []string
	prefixes  []string
}

func (f *fakeKeeper) Mint(_ context.Context, in media.MintInput) (media.Asset, error) {
	r := media.Record{Slug: "inline-9f3c21aa", StorageKey: in.Key, MIME: "image/png", Width: 10, Height: 8}
	f.rows[in.Key] = r
	return media.Asset{Record: r, URL: "/img/" + r.Slug + ".png"}, nil
}

func (f *fakeKeeper) Forget(_ context.Context, key string) error {
	f.forgotten = append(f.forgotten, key)
	delete(f.rows, key)
	return nil
}

func (f *fakeKeeper) ForgetPrefix(_ context.Context, prefix string) error {
	f.prefixes = append(f.prefixes, prefix)
	return nil
}

func (f *fakeKeeper) ByStorageKeys(_ context.Context, keys []string) ([]media.Record, error) {
	out := make([]media.Record, 0, len(keys))
	for _, k := range keys {
		if r, ok := f.rows[k]; ok {
			out = append(out, r)
		}
	}
	return out, nil
}

// An inline image whose body URL is the MINTED /img/{slug} one carries no
// storage key, so matching on the key alone reads it as unreferenced. The whole
// point of looking the slug up is that it is not deleted on the next save.
func TestArticles_InlineGCKeepsAMintedImage(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	keeper := &fakeKeeper{rows: map[string]media.Record{}}
	e.svc.SetMedia(keeper)

	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	base := "cms/articles/" + art.ID.String() + "/"
	minted := base + "inline-minted.png"
	legacy := base + "inline-legacy.png"
	drop := base + "inline-drop.png"
	for _, k := range []string{minted, legacy, drop} {
		e.store.Saved[k] = []byte("x")
	}
	// minted and drop both have rows; only minted is referenced, and only by
	// its slug.
	keeper.rows[minted] = media.Record{Slug: "inline-9f3c21aa", StorageKey: minted, MIME: "image/png", Width: 10, Height: 8}
	keeper.rows[drop] = media.Record{Slug: "inline-dead0000", StorageKey: drop, MIME: "image/png", Width: 10, Height: 8}

	body := `<p>hi</p><img src="/img/inline-9f3c21aa.webp">` +
		`<img src="https://cdn.test/` + legacy + `">`
	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, BodyHTML: &body})
	require.NoError(t, err)

	require.Contains(t, e.store.Saved, minted, "referenced by slug → kept")
	require.Contains(t, e.store.Saved, legacy, "referenced by storage key → kept")
	require.NotContains(t, e.store.Saved, drop, "referenced by nothing → reclaimed")

	// And the reclaimed one lost its public identity with its bytes.
	require.Equal(t, []string{drop}, keeper.forgotten)
	require.NotContains(t, keeper.rows, drop)
}

// Deleting an article reclaims its whole media folder AND every `files` row
// under it, not just the objects.
func TestArticles_DeleteForgetsTheWholeMediaFolder(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	keeper := &fakeKeeper{rows: map[string]media.Record{}}
	e.svc.SetMedia(keeper)

	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	require.NoError(t, e.svc.DeleteArticle(context.Background(), editorActor(owner), art.ID))
	require.Equal(t, []string{"cms/articles/" + art.ID.String() + "/"}, keeper.prefixes)
}

// Replacing the featured image forgets the one it replaced.
func TestArticles_ReplacingFeaturedForgetsTheOldRow(t *testing.T) {
	e := newTestSvc(t)
	e.flags(map[string]bool{shared.FlagArticleCategorize: false})
	keeper := &fakeKeeper{rows: map[string]media.Record{}}
	e.svc.SetMedia(keeper)

	owner := uuid.New()
	art := e.repo.seedArticle("Dr", "dr", owner, ArticleStatusDraft)
	old := "cms/articles/" + art.ID.String() + "/featured-old.png"
	art.FeaturedPath = &old
	newP := "cms/articles/" + art.ID.String() + "/featured-new.png"
	e.store.Saved[old] = []byte("x")
	e.store.Saved[newP] = []byte("x")

	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, FeaturedPath: &newP})
	require.NoError(t, err)
	require.Contains(t, keeper.forgotten, old)
}
