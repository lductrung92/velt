package pages

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// spyRevalidator records the tags a publish asks to revalidate.
type spyRevalidator struct{ tags []string }

func (s *spyRevalidator) Revalidate(_ context.Context, tags ...string) {
	s.tags = append(s.tags, tags...)
}

// TestPublishPage_Revalidates verifies the Phase D hook: publishing a page asks
// the web to revalidate that page's tag.
func TestPublishPage_Revalidates(t *testing.T) {
	env := newTestSvc(t)
	spy := &spyRevalidator{}
	env.svc.SetRevalidator(spy)
	ctx := context.Background()

	created, err := env.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "About"})
	require.NoError(t, err)
	_, err = env.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)
	require.Contains(t, spy.tags, "page:"+created.Slug)
}

// fakeLandingPort stands in for landing.PublicService in page-attach tests.
type fakeLandingPort struct {
	secs []shared.PublicSection
	err  error
	// locale records what the page asked for, so a test can assert the page's
	// language reaches the sections it renders.
	locale *string
}

func (f fakeLandingPort) ResolvePublishedSectionsIn(_ context.Context, _ uuid.UUID, locale string) ([]shared.PublicSection, error) {
	if f.locale != nil {
		*f.locale = locale
	}
	return f.secs, f.err
}

// TestPublicPage_ResolvesInlineWidgets covers the inline-widget path end to end at
// the service layer: an admin publishes a page whose body_json embeds a widget
// node, and the public read resolves it into inline_widgets keyed by placeholder id.
func TestPublicPage_ResolvesInlineWidgets(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()

	created, err := env.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{
		Title:    "Inline",
		BodyHTML: ptr(`<p>Hi</p><div data-kd-widget="w1"></div>`),
		BodyJSON: json.RawMessage(`{"type":"doc","content":[
			{"type":"widget","attrs":{"wid":"w1","wtype":"games_list","config":{"limit":4}}}
		]}`),
	})
	require.NoError(t, err)

	_, err = env.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	pub := env.publicSvc(nil)
	page, err := pub.GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)

	require.Len(t, page.InlineWidgets, 1)
	w, ok := page.InlineWidgets["w1"]
	require.True(t, ok, "placeholder id w1 must be resolved")
	require.Equal(t, "games_list", w.Type)
	require.NotNil(t, w.Data, "nil ports resolve to an empty (non-nil) result")
}

func ptr(s string) *string { return &s }

// TestPublicPage_AttachedLandingSections covers the page↔landing integration: a
// page attaches a landing (landing_id), and the public read surfaces that
// landing's resolved sections (frozen landing_id → landing port → sections).
func TestPublicPage_AttachedLandingSections(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	lid := uuid.New()

	created, err := env.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{
		Title:     "Home",
		LandingID: &lid,
	})
	require.NoError(t, err)
	require.NotNil(t, created.LandingID)
	require.Equal(t, lid, *created.LandingID)

	_, err = env.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	port := fakeLandingPort{secs: []shared.PublicSection{{Type: "hero", SortOrder: 0}}}
	pub := env.publicSvc(port)
	page, err := pub.GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)
	require.Len(t, page.Sections, 1)
	require.Equal(t, "hero", page.Sections[0].Type)
}

// TestPublicPage_AttachedLandingUnpublished_EmptySections: a page attaches a
// landing, but the landing resolves to no sections (unpublished/deleted → the
// port returns nil) → the page renders with an empty sections list.
func TestPublicPage_AttachedLandingUnpublished_EmptySections(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()
	lid := uuid.New()
	created, err := env.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{
		Title:     "Home",
		LandingID: &lid,
	})
	require.NoError(t, err)
	_, err = env.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	port := fakeLandingPort{secs: nil} // landing not published → no sections
	pub := env.publicSvc(port)
	page, err := pub.GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)
	require.NotNil(t, page.Sections)
	require.Empty(t, page.Sections)
}

// TestPublicPage_NoLanding_EmptySections: a page with no landing yields an empty
// (non-nil) sections list even when a landing port is present.
func TestPublicPage_NoLanding_EmptySections(t *testing.T) {
	env := newTestSvc(t)
	ctx := context.Background()

	created, err := env.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Plain"})
	require.NoError(t, err)
	_, err = env.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	port := fakeLandingPort{secs: []shared.PublicSection{{Type: "hero"}}}
	pub := env.publicSvc(port)
	page, err := pub.GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)
	require.NotNil(t, page.Sections)
	require.Empty(t, page.Sections)
}
