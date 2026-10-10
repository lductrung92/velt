package articles

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakePublicRepo is an in-memory publicReader for the public-service tests.
type fakePublicRepo struct {
	cards      []PublicCard
	total      int
	lastFilter PublicListFilter
	bySlug     map[string]*PublicArticle
}

func (f *fakePublicRepo) ListPublishedPage(_ context.Context, flt PublicListFilter) ([]PublicCard, int, error) {
	f.lastFilter = flt
	return f.cards, f.total, nil
}

func (f *fakePublicRepo) GetPublishedBySlug(_ context.Context, slug string) (*PublicArticle, error) {
	if a, ok := f.bySlug[slug]; ok {
		return a, nil
	}
	return nil, shared.ErrNotFound
}

func TestPublicService_ListPublished_DefaultsAndCover(t *testing.T) {
	cover := "media/cover.png"
	repo := &fakePublicRepo{
		cards: []PublicCard{{Slug: "a", Title: "A", FeaturedPath: &cover}},
		total: 1,
	}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	res, err := svc.ListPublished(context.Background(), " hello ", "bogus", 0, 0)
	require.NoError(t, err)
	require.Equal(t, 1, res.Page)
	require.Equal(t, publicDefaultPageSize, res.PageSize)
	require.Equal(t, 1, res.Total)
	// Unknown sort falls back to newest; query passes through.
	require.Equal(t, "newest", repo.lastFilter.Sort)
	require.Equal(t, " hello ", repo.lastFilter.Query)
	require.Equal(t, publicDefaultPageSize, repo.lastFilter.Limit)
	require.Equal(t, 0, repo.lastFilter.Offset)
	// Cover path is resolved to a URL.
	require.Len(t, res.Items, 1)
	require.NotNil(t, res.Items[0].CoverURL)
	require.Equal(t, "https://cdn.test/media/cover.png", *res.Items[0].CoverURL)
}

func TestPublicService_ListPublished_ClampsAndOffset(t *testing.T) {
	repo := &fakePublicRepo{}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	_, err := svc.ListPublished(context.Background(), "", "oldest", 3, 999)
	require.NoError(t, err)
	require.Equal(t, "oldest", repo.lastFilter.Sort)
	require.Equal(t, publicMaxPageSize, repo.lastFilter.Limit) // clamped
	require.Equal(t, (3-1)*publicMaxPageSize, repo.lastFilter.Offset)
}

func TestPublicService_GetBySlug(t *testing.T) {
	body := "<p>hi</p>"
	repo := &fakePublicRepo{bySlug: map[string]*PublicArticle{
		"post": {Slug: "post", Title: "Post", BodyHTML: &body},
	}}
	svc := NewPublicService(repo, cmstest.NewFakeStore())

	d, err := svc.GetBySlug(context.Background(), "post")
	require.NoError(t, err)
	require.Equal(t, "Post", d.Title)
	require.NotNil(t, d.BodyHTML)
	require.Equal(t, body, *d.BodyHTML)

	_, err = svc.GetBySlug(context.Background(), "missing")
	require.Error(t, err) // mapped to not_found
}
