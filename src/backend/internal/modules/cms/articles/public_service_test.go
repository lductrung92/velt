package articles

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// fakePublicRepo is an in-memory publicReader for the public-service tests.
type fakePublicRepo struct {
	cards      []PublicCard
	total      int
	lastFilter PublicListFilter
	lastLocale string
	bySlug     map[string]*PublicArticle
	moved      string // non-empty → GetPublishedBySlug reports a 301 target
}

func (f *fakePublicRepo) ListPublishedPage(_ context.Context, flt PublicListFilter) ([]PublicCard, int, error) {
	f.lastFilter = flt
	return f.cards, f.total, nil
}

func (f *fakePublicRepo) GetPublishedBySlug(_ context.Context, locale, slug string) (*PublicArticle, error) {
	f.lastLocale = locale
	if f.moved != "" {
		return nil, ErrMoved{Slug: f.moved}
	}
	if a, ok := f.bySlug[slug]; ok {
		return a, nil
	}
	return nil, shared.ErrNotFound
}

// fakeLocales stands in for the translation module's language list.
type fakeLocales struct{ list []string }

func (f fakeLocales) Locales(context.Context) []string { return f.list }

func TestPublicService_ListPublished_DefaultsAndCover(t *testing.T) {
	cover := "media/cover.png"
	repo := &fakePublicRepo{
		cards: []PublicCard{{Slug: "a", Title: "A", FeaturedPath: &cover}},
		total: 1,
	}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	res, err := svc.ListPublished(context.Background(), "", " hello ", "bogus", 0, 0)
	require.NoError(t, err)
	require.Equal(t, 1, res.Page)
	require.Equal(t, publicDefaultPageSize, res.PageSize)
	require.Equal(t, 1, res.Total)
	// Unknown sort falls back to newest; query passes through.
	require.Equal(t, "newest", repo.lastFilter.Sort)
	require.Equal(t, " hello ", repo.lastFilter.Query)
	require.Equal(t, publicDefaultPageSize, repo.lastFilter.Limit)
	require.Equal(t, 0, repo.lastFilter.Offset)
	// No locale asked for → the source language.
	require.Equal(t, baseLocale, repo.lastFilter.Locale)
	// Cover path is resolved to a URL.
	require.Len(t, res.Items, 1)
	require.NotNil(t, res.Items[0].CoverURL)
	require.Equal(t, "https://cdn.test/media/cover.png", *res.Items[0].CoverURL)
}

func TestPublicService_ListPublished_ClampsAndOffset(t *testing.T) {
	repo := &fakePublicRepo{}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	_, err := svc.ListPublished(context.Background(), "", "", "oldest", 3, 999)
	require.NoError(t, err)
	require.Equal(t, "oldest", repo.lastFilter.Sort)
	require.Equal(t, publicMaxPageSize, repo.lastFilter.Limit) // clamped
	require.Equal(t, (3-1)*publicMaxPageSize, repo.lastFilter.Offset)
}

// A locale the site does not publish must serve the original rather than fail:
// a visitor who mistypes a query parameter has not earned an error page.
func TestPublicService_ResolveLocale(t *testing.T) {
	for _, tc := range []struct {
		name, asked, want string
		enabled           []string
	}{
		{"enabled locale is honoured", "en", "en", []string{"en"}},
		{"case and spaces are normalised", " EN ", "en", []string{"en"}},
		{"locale that is not enabled falls back", "fr", baseLocale, []string{"en"}},
		{"translation off falls back", "en", baseLocale, nil},
		{"empty means the source language", "", baseLocale, []string{"en"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakePublicRepo{}
			svc := NewPublicService(repo, cmstest.NewFakeStore())
			svc.SetLocales(fakeLocales{list: tc.enabled})

			_, err := svc.ListPublished(context.Background(), tc.asked, "", "", 1, 10)
			require.NoError(t, err)
			require.Equal(t, tc.want, repo.lastFilter.Locale)
		})
	}
}

func TestPublicService_GetBySlug(t *testing.T) {
	body := "<p>hi</p>"
	repo := &fakePublicRepo{bySlug: map[string]*PublicArticle{
		"post": {Slug: "post", Title: "Post", BodyHTML: &body},
	}}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	d, err := svc.GetBySlug(context.Background(), "", "post")
	require.NoError(t, err)
	require.Equal(t, "Post", d.Title)
	require.Equal(t, baseLocale, d.Locale)
	require.NotNil(t, d.BodyHTML)
	require.Equal(t, body, *d.BodyHTML)

	_, err = svc.GetBySlug(context.Background(), "", "missing")
	require.Error(t, err) // mapped to not_found
}

// ErrMoved has to survive the service untouched: the handler turns it into a
// 301, and collapsing it into a 404 here would break every link already handed
// out whenever a slug changes.
func TestPublicService_GetBySlug_MovedReachesCaller(t *testing.T) {
	repo := &fakePublicRepo{moved: "new-slug"}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	_, err := svc.GetBySlug(context.Background(), "", "old-slug")
	require.ErrorAs(t, err, &ErrMoved{})
	var moved ErrMoved
	require.ErrorAs(t, err, &moved)
	require.Equal(t, "new-slug", moved.Slug)
}

// The alternates block must include the language being viewed, not only the
// others: hreflang is ignored unless every version also points at itself.
func TestPublicService_GetBySlug_AlternatesIncludeSelf(t *testing.T) {
	repo := &fakePublicRepo{bySlug: map[string]*PublicArticle{
		"bai-viet": {Slug: "bai-viet", Title: "Bài viết", Alternates: []pubdocs.Ref{
			{Locale: "vi", Slug: "bai-viet"},
			{Locale: "en", Slug: "the-post"},
		}},
	}}
	svc := NewPublicService(repo, cmstest.NewFakeStore())
	svc.SetLocales(fakeLocales{list: []string{"en"}})

	d, err := svc.GetBySlug(context.Background(), "vi", "bai-viet")
	require.NoError(t, err)
	require.Len(t, d.Alternates, 2)
	require.Equal(t, "vi", d.Alternates[0].Locale)
	require.True(t, d.Alternates[0].XDefault, "Vietnamese is x-default: it is the one version that always exists")
	require.Equal(t, "en", d.Alternates[1].Locale)
	require.False(t, d.Alternates[1].XDefault)
}
