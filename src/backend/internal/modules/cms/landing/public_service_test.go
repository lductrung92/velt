package landing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
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

// A section type is only reachable if the request validator admits it, so the
// five Zukatek types are checked against the real `oneof` tag, not the service.
func TestCreateSectionRequest_AcceptsZukatekTypes(t *testing.T) {
	for _, typ := range []string{
		SectionAudiencePicker, SectionProductGrid, SectionTeam,
		SectionBuyingSteps, SectionContactForm,
	} {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"type":"`+typ+`"}`))
		var body CreateSectionRequest
		require.NoError(t, httpx.DecodeAndValidate(req, &body), typ)
	}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"type":"not_a_section"}`))
	var body CreateSectionRequest
	require.Error(t, httpx.DecodeAndValidate(req, &body))
}

// The five Zukatek sections survive a publish/resolve round-trip. product_grid
// and team are dynamic by contract but have no widget behind them yet, so their
// data is null — see resolveSectionData.
func TestResolvePublishedSections_ZukatekSections(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	l, err := env.svc.CreateLanding(ctx, cmstest.SuperActor(), CreateLandingRequest{Key: "z", Name: "Z"})
	require.NoError(t, err)
	configs := map[string]string{
		SectionAudiencePicker: `{"title":"Bạn là ai?","items":[{"key":"school","label":"Trường","cta_href":"/lien-he"}]}`,
		SectionProductGrid:    `{"title":"Sản phẩm","limit":6,"category":"robot","show_all_href":"/san-pham"}`,
		SectionTeam:           `{"title":"Đội ngũ","limit":4}`,
		SectionBuyingSteps:    `{"title":"Mua thế nào","steps":[{"title":"Liên hệ","body":"Gọi cho chúng tôi"}]}`,
		SectionContactForm:    `{"title":"Liên hệ","email":"a@b.vn","zalo":"0900","note":"8h-17h"}`,
	}
	order := []string{SectionAudiencePicker, SectionProductGrid, SectionTeam, SectionBuyingSteps, SectionContactForm}
	for _, typ := range order {
		_, err := env.svc.CreateSection(ctx, cmstest.SuperActor(), l.ID, CreateSectionRequest{
			Type: typ, Config: json.RawMessage(configs[typ]),
		})
		require.NoError(t, err, typ)
	}
	_, err = env.svc.PublishLanding(ctx, cmstest.SuperActor(), l.ID)
	require.NoError(t, err)

	secs, err := NewPublicService(env.repo, widgets.NewResolver(widgets.Ports{}), cmstest.NewFakeStore()).
		ResolvePublishedSections(ctx, l.ID)
	require.NoError(t, err)
	require.Len(t, secs, 5)
	// Static sections carry their content in config and resolve to nil. The two
	// dynamic ones resolve through the widget ports; with no ports wired they
	// answer with an EMPTY list rather than nil, so a section that is merely
	// unconfigured still renders as itself instead of vanishing.
	dynamic := map[string]bool{SectionProductGrid: true, SectionTeam: true}
	for i, typ := range order {
		require.Equal(t, typ, secs[i].Type)
		if dynamic[typ] {
			require.NotNil(t, secs[i].Data, typ)
			continue
		}
		require.Nil(t, secs[i].Data, typ)
	}
	var picker map[string]any
	require.NoError(t, json.Unmarshal(secs[0].Config, &picker))
	require.Equal(t, "Bạn là ai?", picker["title"]) // config survives the snapshot verbatim
}

// A snapshot predating the sanitizer (or hand-edited in the DB) can hold a config
// that is not an object. The dynamic section must go to data:null and the other
// sections must still be served.
func TestResolvePublishedSections_MalformedDynamicConfig(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	lid := buildPublishedLanding(t, env)

	// Corrupt the frozen snapshot behind the service's back: a string config, and
	// a missing one, where an object is expected.
	var snap landingSnapshot
	require.NoError(t, json.Unmarshal(env.repo.landings[lid].PublishedSnapshot, &snap))
	require.Equal(t, SectionFeaturedArticles, snap.Sections[1].Type)
	snap.Sections[1].Config = json.RawMessage(`"Latest"`)
	snap.Sections = append(snap.Sections, sectionSnapshot{
		Type: SectionCategoriesShowcase, SortOrder: 2, Config: json.RawMessage(`null`),
	})
	raw, err := json.Marshal(snap)
	require.NoError(t, err)
	env.repo.landings[lid].PublishedSnapshot = raw

	resolver := widgets.NewResolver(widgets.Ports{
		Articles:   fakeArticlesPort{items: []widgets.ArticleItem{{Slug: "a", Title: "A"}}},
		Categories: fakeCategoriesPort{items: []widgets.CategoryItem{{Slug: "s", Name: "N"}}},
	})
	secs, err := NewPublicService(env.repo, resolver, cmstest.NewFakeStore()).
		ResolvePublishedSections(ctx, lid)
	require.NoError(t, err, "a malformed config must never fail the request")
	require.Len(t, secs, 3)
	require.Nil(t, secs[1].Data, "a non-object config yields data:null")
	require.Nil(t, secs[2].Data, "a missing config yields data:null")
	require.Equal(t, SectionHero, secs[0].Type, "the healthy sections are still served")
}
