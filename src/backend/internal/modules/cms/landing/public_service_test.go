package landing

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// fakeArticlesPort feeds the widget resolver for featured_articles sections.
type fakeArticlesPort struct {
	items []widgets.ArticleItem
	err   error
}

func (f fakeArticlesPort) ListArticles(context.Context, widgets.ArticlesQuery) ([]widgets.ArticleItem, error) {
	return f.items, f.err
}

// fakeCategoriesPort feeds the widget resolver for categories_showcase sections.
type fakeCategoriesPort struct {
	items []widgets.CategoryItem
}

func (f fakeCategoriesPort) ListCategories(context.Context, widgets.CategoriesQuery) ([]widgets.CategoryItem, error) {
	return f.items, nil
}

// buildPublishedLanding creates a landing with a hero (image) + a featured_articles
// section, then publishes it. Returns the landing id.
func buildPublishedLanding(t *testing.T, env *tenv) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "home", Name: "Home"})
	require.NoError(t, err)
	img := "cms/landing/" + l.ID.String() + "/hero.png"
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionHero,
		Config: json.RawMessage(`{"heading":"Hi","image_path":"` + img + `"}`),
	})
	require.NoError(t, err)
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionFeaturedArticles,
		Config: json.RawMessage(`{"title":"Latest","columns":3,"limit":2}`),
	})
	require.NoError(t, err)
	_, err = env.svc.PublishLanding(ctx, cmstest.SuperActor(), l.ID)
	require.NoError(t, err)
	return l.ID
}

func TestResolvePublishedSections(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "home", Name: "Home"})
	require.NoError(t, err)
	img := "cms/landing/" + l.ID.String() + "/hero.png" // must live under the landing's own media folder
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionHero,
		Config: json.RawMessage(`{"heading":"Hi","image_path":"` + img + `"}`),
	})
	require.NoError(t, err)
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionFeaturedArticles,
		Config: json.RawMessage(`{"title":"Latest","columns":3,"limit":2}`),
	})
	require.NoError(t, err)
	_, err = env.svc.PublishLanding(ctx, cmstest.SuperActor(), l.ID)
	require.NoError(t, err)

	resolver := widgets.NewResolver(widgets.Ports{
		Articles: fakeArticlesPort{items: []widgets.ArticleItem{{Slug: "a", Title: "A"}}},
	})
	pub := NewPublicService(env.repo, resolver, cmstest.NewFakeStore())

	secs, err := pub.ResolvePublishedSections(ctx, l.ID)
	require.NoError(t, err)
	require.Len(t, secs, 2)

	// Section 1: hero — media *_path resolved to a sibling *_url, no dynamic data.
	require.Equal(t, SectionHero, secs[0].Type)
	var hero map[string]any
	require.NoError(t, json.Unmarshal(secs[0].Config, &hero))
	require.Equal(t, img, hero["image_path"])
	require.Equal(t, "https://cdn.test/"+img, hero["image_url"])
	require.Nil(t, secs[0].Data)

	// Section 2: featured_articles — dynamic data resolved via the widget resolver.
	require.Equal(t, SectionFeaturedArticles, secs[1].Type)
	require.NotNil(t, secs[1].Data)
	data, _ := json.Marshal(secs[1].Data)
	require.Contains(t, string(data), `"slug":"a"`)
}

func TestResolvePublishedSections_Categories(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "c", Name: "C"})
	require.NoError(t, err)
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionCategoriesShowcase,
		Config: json.RawMessage(`{"title":"Topics","limit":5}`),
	})
	require.NoError(t, err)
	_, err = env.svc.PublishLanding(ctx, cmstest.SuperActor(), l.ID)
	require.NoError(t, err)

	resolver := widgets.NewResolver(widgets.Ports{
		Categories: fakeCategoriesPort{items: []widgets.CategoryItem{{Slug: "s", Name: "N", Count: 3}}},
	})
	secs, err := NewPublicService(env.repo, resolver, cmstest.NewFakeStore()).
		ResolvePublishedSections(ctx, l.ID)
	require.NoError(t, err)
	require.Len(t, secs, 1)
	require.NotNil(t, secs[0].Data)
	data, _ := json.Marshal(secs[0].Data)
	require.Contains(t, string(data), `"slug":"s"`)
}

// A missing landing (deleted, but a stale snapshot still froze its id) yields no
// sections and no error — the hosting page renders without them.
func TestResolvePublishedSections_NotFound(t *testing.T) {
	env := newTestSvc(t)
	pub := NewPublicService(env.repo, widgets.NewResolver(widgets.Ports{}), cmstest.NewFakeStore())
	secs, err := pub.ResolvePublishedSections(context.Background(), uuid.New())
	require.NoError(t, err)
	require.Nil(t, secs)
}

// Media URLs are injected for nested list items (gallery/testimonials/logos), not
// just top-level image_path — exercises the recursive walk.
func TestResolvePublishedSections_NestedMediaURL(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "g", Name: "G"})
	require.NoError(t, err)
	img := "cms/landing/" + l.ID.String() + "/g1.png"
	_, err = env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
		Type:   SectionGallery,
		Config: json.RawMessage(`{"items":[{"image_path":"` + img + `","caption":"x"}]}`),
	})
	require.NoError(t, err)
	_, err = env.svc.PublishLanding(ctx, cmstest.SuperActor(), l.ID)
	require.NoError(t, err)

	secs, err := NewPublicService(env.repo, widgets.NewResolver(widgets.Ports{}), cmstest.NewFakeStore()).
		ResolvePublishedSections(ctx, l.ID)
	require.NoError(t, err)
	require.Len(t, secs, 1)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(secs[0].Config, &cfg))
	items := cfg["items"].([]any)
	item0 := items[0].(map[string]any)
	require.Equal(t, "https://cdn.test/"+img, item0["image_url"])
	require.Equal(t, img, item0["image_path"])
}

func TestResolvePublishedSections_Unpublished(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "draft", Name: "Draft"})
	require.NoError(t, err)

	pub := NewPublicService(env.repo, widgets.NewResolver(widgets.Ports{}), cmstest.NewFakeStore())
	secs, err := pub.ResolvePublishedSections(ctx, l.ID)
	require.NoError(t, err)
	require.Nil(t, secs, "an unpublished landing yields no sections")
}

func TestResolvePublishedSections_DynamicResolveError(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	lid := buildPublishedLanding(t, env)

	// Articles port errors → featured_articles data must be null, not a failure.
	resolver := widgets.NewResolver(widgets.Ports{
		Articles: fakeArticlesPort{err: context.DeadlineExceeded},
	})
	pub := NewPublicService(env.repo, resolver, cmstest.NewFakeStore())
	secs, err := pub.ResolvePublishedSections(ctx, lid)
	require.NoError(t, err)
	require.Len(t, secs, 2)
	require.Nil(t, secs[1].Data, "a failed dynamic resolve yields data:null")
}
