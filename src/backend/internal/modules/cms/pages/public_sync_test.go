package pages

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// The bug this module shipped with, now unable to happen. cms_pages enforces
// UNIQUE (parent_id, slug), so a root page and a child page may both be called
// "about" — and they were, with the public lookup serving whichever sorted first
// and the other unreachable for good, silently. The read model's key is the URL,
// so the second publish is refused out loud.
func TestPublishPage_SecondPageUnderSameSlugIsRefused(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	parent := e.repo.seedPage("Docs", "docs", nil, PageStatusDraft)
	root := e.repo.seedPage("About", "about", nil, PageStatusDraft)
	child := e.repo.seedPage("About", "about", &parent.ID, PageStatusDraft) // legal in cms_pages

	_, err := e.svc.PublishPage(ctx, cmstest.SuperActor(), root.ID)
	require.NoError(t, err)

	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), child.ID)
	cmstest.AssertAppErr(t, err, http.StatusConflict, "slug_taken")

	// And the page that did get the URL is the one still being served.
	page, err := e.publicSvc(nil).GetPublishedPage(ctx, "", "about")
	require.NoError(t, err)
	require.Equal(t, "about", page.Slug)
	alts, err := e.docs.Alternates(ctx, EntityPage, root.ID)
	require.NoError(t, err)
	require.Len(t, alts, 1, "the winning URL belongs to the root page alone")
}

// Renaming a published page leaves the old slug behind as a redirect, so links
// already handed out keep working instead of turning into 404s.
func TestUpdatePage_SlugChangeLeavesA301(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Old"})
	require.NoError(t, err)
	published, err := e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	renamed, err := e.svc.UpdatePage(ctx, cmstest.SuperActor(), created.ID, UpdatePageRequest{
		Slug: cmstest.Strptr("new"), UpdatedAt: &published.UpdatedAt,
	})
	require.NoError(t, err)
	require.Equal(t, "new", renamed.Slug)

	pub := e.publicSvc(nil)
	page, err := pub.GetPublishedPage(ctx, "", "new")
	require.NoError(t, err)
	require.Equal(t, "new", page.Slug)

	_, err = pub.GetPublishedPage(ctx, "", "old")
	var moved ErrMoved
	require.ErrorAs(t, err, &moved)
	require.Equal(t, "new", moved.Slug)
}

// Unpublishing takes the URL off the public read model; deleting removes it
// entirely, redirect rows included — an orphan there is a URL still serving a
// page that no longer exists.
func TestSyncPublic_UnpublishAndDelete(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Gone"})
	require.NoError(t, err)
	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	_, err = e.svc.UnpublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)
	_, err = e.publicSvc(nil).GetPublishedPage(ctx, "", created.Slug)
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")

	tr := &fakeTranslator{}
	e.svc.SetTranslator(tr)
	require.NoError(t, e.svc.DeletePage(ctx, cmstest.SuperActor(), created.ID))
	require.Empty(t, e.docs.rows, "delete purges the retired rows too")
	require.Equal(t, []uuid.UUID{created.ID}, tr.purged)
}

// Publishing with translations on writes one document per language. A language
// with no translated slug still gets a page under the Vietnamese slug: hreflang
// only counts when every version points at the others, so an ugly URL beats a
// missing one.
func TestSyncPublic_PublishesOneDocPerLocale(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Giới thiệu"})
	require.NoError(t, err)
	e.svc.SetTranslator(&fakeTranslator{
		locales: []string{"en", "fr"},
		values: map[uuid.UUID]map[string]map[string]any{
			created.ID: {"en": {"slug": "about", "title": "About us"}},
		},
	})
	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	pub := e.publicSvc(nil)
	pub.SetLocales(fakeLocales{list: []string{"en", "fr"}})
	en, err := pub.GetPublishedPage(ctx, "en", "about")
	require.NoError(t, err)
	require.Equal(t, "About us", en.Title)
	require.Equal(t, "en", en.Locale)

	// French was declared but not translated → the Vietnamese slug and title.
	fr, err := pub.GetPublishedPage(ctx, "fr", created.Slug)
	require.NoError(t, err)
	require.Equal(t, "Giới thiệu", fr.Title)

	// Every language, the one being viewed included: hreflang is ignored unless
	// each version points at the others AND at itself.
	require.Len(t, en.Alternates, 3)
	require.Equal(t, "en", en.Alternates[0].Locale)
	require.False(t, en.Alternates[0].XDefault)
	require.Equal(t, "vi", en.Alternates[2].Locale)
	require.True(t, en.Alternates[2].XDefault, "Vietnamese is x-default: the one version that always exists")
}

// A translated slug owned by another page must not take the whole publish down
// with it: the Vietnamese page goes out, and the editor gets a 409 naming the
// one slug to fix.
func TestSyncPublic_TranslatedSlugClashStillPublishesSource(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	first, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Một"})
	require.NoError(t, err)
	e.svc.SetTranslator(&fakeTranslator{
		locales: []string{"en"},
		values:  map[uuid.UUID]map[string]map[string]any{first.ID: {"en": {"slug": "taken"}}},
	})
	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), first.ID)
	require.NoError(t, err)

	second, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Hai"})
	require.NoError(t, err)
	e.svc.SetTranslator(&fakeTranslator{
		locales: []string{"en"},
		values:  map[uuid.UUID]map[string]map[string]any{second.ID: {"en": {"slug": "taken"}}},
	})
	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), second.ID)
	cmstest.AssertAppErr(t, err, http.StatusConflict, "slug_taken")

	// The page itself is never dark: Vietnamese is live, English simply is not.
	page, err := e.publicSvc(nil).GetPublishedPage(ctx, "", second.Slug)
	require.NoError(t, err)
	require.Equal(t, "Hai", page.Title)
	require.Len(t, page.Alternates, 1)
	require.Equal(t, baseLocale, page.Alternates[0].Locale)
}

// Losing the translations must not stop a publish: one publish without its
// translated copies is better than a page that cannot go out at all.
func TestSyncPublic_TranslationLoadFailureStillPublishes(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Vẫn chạy"})
	require.NoError(t, err)
	e.svc.SetTranslator(&fakeTranslator{locales: []string{"en"}, bundErr: context.DeadlineExceeded})

	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)
	_, err = e.publicSvc(nil).GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)
}

// Save = live: editing a published page pushes the new body to the read model,
// not the copy frozen at publish time.
func TestUpdatePage_RepublishesTheEditedBody(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Trước"})
	require.NoError(t, err)
	published, err := e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	_, err = e.svc.UpdatePage(ctx, cmstest.SuperActor(), created.ID, UpdatePageRequest{
		Title: cmstest.Strptr("Sau"), UpdatedAt: &published.UpdatedAt,
	})
	require.NoError(t, err)

	page, err := e.publicSvc(nil).GetPublishedPage(ctx, "", created.Slug)
	require.NoError(t, err)
	require.Equal(t, "Sau", page.Title)
}

// search_text is title + SEO description: a page has no excerpt, and the body is
// long HTML that would make every page match almost anything.
func TestSearchText_TitleAndSEODescription(t *testing.T) {
	var body map[string]any
	require.NoError(t, json.Unmarshal([]byte(`{
		"title": " Giới thiệu ",
		"body_html": "<p>một đoạn rất dài</p>",
		"seo": {"description": "Về công ty", "title": "ignored"}
	}`), &body))
	require.Equal(t, "Giới thiệu Về công ty", searchText(body))

	require.Equal(t, "Chỉ tiêu đề", searchText(map[string]any{"title": "Chỉ tiêu đề"}))
}

// AuthorizeTranslate reuses the module's own editing gate, and a page that is
// not there is a 404 — a translator must not be able to probe for ids.
func TestAuthorizeTranslate(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()
	p := e.repo.seedPage("A", "a", nil, PageStatusDraft)

	require.NoError(t, e.svc.AuthorizeTranslate(ctx, cmstest.ActorWith(permEdit), p.ID))

	err := e.svc.AuthorizeTranslate(ctx, cmstest.ActorWith(permView), p.ID)
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")

	err = e.svc.AuthorizeTranslate(ctx, cmstest.SuperActor(), uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

// A visitor who lands on the Vietnamese slug while asking for English is sent to
// the English address, not shown the same page at a second indexable URL.
func TestPublicPage_CrossLocaleRedirect(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Liên hệ"})
	require.NoError(t, err)
	e.svc.SetTranslator(&fakeTranslator{
		locales: []string{"en"},
		values:  map[uuid.UUID]map[string]map[string]any{created.ID: {"en": {"slug": "contact"}}},
	})
	_, err = e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)

	pub := e.publicSvc(nil)
	pub.SetLocales(fakeLocales{list: []string{"en"}})

	_, err = pub.GetPublishedPage(ctx, "en", created.Slug)
	var moved ErrMoved
	require.ErrorAs(t, err, &moved)
	require.Equal(t, "contact", moved.Slug)

	// A language the site does not publish serves the original rather than an
	// error: a mistyped query parameter has not earned an error page.
	page, err := pub.GetPublishedPage(ctx, "de", created.Slug)
	require.NoError(t, err)
	require.Equal(t, baseLocale, page.Locale)
}

// fakeLocales stands in for the translation module's language list.
type fakeLocales struct{ list []string }

func (f fakeLocales) Locales(context.Context) []string { return f.list }

// With no read model wired the module behaves exactly as it did before it
// existed: publishing writes the snapshot column and nothing else.
func TestSyncPublic_NoStoreWiredIsANoOp(t *testing.T) {
	e := newTestSvc(t)
	e.svc.pub = nil
	ctx := context.Background()

	created, err := e.svc.CreatePage(ctx, cmstest.SuperActor(), CreatePageRequest{Title: "Rời"})
	require.NoError(t, err)
	published, err := e.svc.PublishPage(ctx, cmstest.SuperActor(), created.ID)
	require.NoError(t, err)
	require.Equal(t, PageStatusPublished, published.Status)
	require.Empty(t, e.docs.rows)

	_, err = e.publicSvc(nil).GetPublishedPage(ctx, "", created.Slug)
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}
