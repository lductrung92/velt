package taxonomy

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeTranslator is an in-memory Translator. It counts Bundle calls so a test
// can prove a card list is one round trip rather than one per card.
type fakeTranslator struct {
	locales []string
	values  map[uuid.UUID]map[string]any
	calls   int
	err     error
	purged  []uuid.UUID
}

func newFakeTranslator() *fakeTranslator {
	return &fakeTranslator{locales: []string{"en"}, values: map[uuid.UUID]map[string]any{}}
}

func (f *fakeTranslator) Locales(context.Context) []string { return f.locales }

func (f *fakeTranslator) Bundle(_ context.Context, _ string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	out := map[uuid.UUID]map[string]map[string]any{}
	for _, id := range ids {
		v, ok := f.values[id]
		if !ok {
			continue
		}
		out[id] = map[string]map[string]any{locales[0]: v}
	}
	return out, nil
}

func (f *fakeTranslator) Purge(_ context.Context, _ string, id uuid.UUID) error {
	f.purged = append(f.purged, id)
	return f.err
}

// --- Public card fallback and batching ---

// newPublicRepo builds a PublicRepo with no pool: these tests exercise the
// overlay, which never reaches the database.
func newPublicRepo(tr Translator) *PublicRepo {
	r := &PublicRepo{}
	r.SetTranslator(tr, nil)
	return r
}

func TestTranslateCards_FallsBackPerCard(t *testing.T) {
	tr := newFakeTranslator()
	r := newPublicRepo(tr)
	named, blank, missing := uuid.New(), uuid.New(), uuid.New()
	tr.values[named] = map[string]any{"name": "News"}
	tr.values[blank] = map[string]any{"name": "   "}

	cards := []PublicCategoryCard{
		{ID: named, Name: "Tin Tức", Slug: "tin-tuc"},
		{ID: blank, Name: "Thể Thao", Slug: "the-thao"},
		{ID: missing, Name: "Đời Sống", Slug: "doi-song"},
	}
	r.translate(context.Background(), cards, "en")

	require.Equal(t, "News", cards[0].Name)
	require.Equal(t, "Thể Thao", cards[1].Name)
	require.Equal(t, "Đời Sống", cards[2].Name)
}

func TestTranslateCards_KeepsTheVietnameseSlug(t *testing.T) {
	// A card must link at the slug the category page can actually resolve.
	tr := newFakeTranslator()
	r := newPublicRepo(tr)
	id := uuid.New()
	tr.values[id] = map[string]any{"name": "News", "slug": "news"}

	cards := []PublicCategoryCard{{ID: id, Name: "Tin Tức", Slug: "tin-tuc"}}
	r.translate(context.Background(), cards, "en")
	require.Equal(t, "tin-tuc", cards[0].Slug)
}

func TestTranslateCards_LoadsEveryCardInOneCall(t *testing.T) {
	tr := newFakeTranslator()
	r := newPublicRepo(tr)
	cards := make([]PublicCategoryCard, 20)
	for i := range cards {
		cards[i] = PublicCategoryCard{ID: uuid.New(), Name: fmt.Sprintf("Mục %02d", i)}
		tr.values[cards[i].ID] = map[string]any{"name": fmt.Sprintf("Topic %02d", i)}
	}

	r.translate(context.Background(), cards, "en")
	require.Equal(t, 1, tr.calls, "a 20-card widget must stay one round trip")
	for i := range cards {
		require.Equal(t, fmt.Sprintf("Topic %02d", i), cards[i].Name)
	}
}

func TestTranslateCards_FailureServesVietnamese(t *testing.T) {
	tr := newFakeTranslator()
	tr.err = errors.New("store down")
	r := newPublicRepo(tr)

	cards := []PublicCategoryCard{{ID: uuid.New(), Name: "Tin Tức"}}
	r.translate(context.Background(), cards, "en")
	require.Equal(t, "Tin Tức", cards[0].Name)
}

func TestResolveLocale_OnlyOfferedLanguages(t *testing.T) {
	ctx := context.Background()
	tr := newFakeTranslator()
	r := newPublicRepo(tr)
	require.Equal(t, "en", r.resolveLocale(ctx, "EN "))
	require.Equal(t, baseLocale, r.resolveLocale(ctx, "fr"))
	require.Equal(t, baseLocale, r.resolveLocale(ctx, ""))
	require.Equal(t, baseLocale, newPublicRepo(nil).resolveLocale(ctx, "en"))
}

// --- Purge ---

func TestDeleteCategory_PurgesTranslations(t *testing.T) {
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	cat := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)

	require.NoError(t, e.svc.DeleteCategory(context.Background(), cmstest.ActorWith(permManage), cat.ID))
	require.Equal(t, []uuid.UUID{cat.ID}, tr.purged)
}

func TestDeleteTag_PurgesTranslations(t *testing.T) {
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	tag := e.repo.seedTag("Golang", "golang")

	require.NoError(t, e.svc.DeleteTag(context.Background(), cmstest.ActorWith(permManage), tag.ID))
	require.Equal(t, []uuid.UUID{tag.ID}, tr.purged)
}

func TestMergeTags_PurgesTheSourceOnly(t *testing.T) {
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	src := e.repo.seedTag("Go", "go")
	dst := e.repo.seedTag("Golang", "golang")

	_, err := e.svc.MergeTags(context.Background(), cmstest.ActorWith(permManage),
		MergeTagsRequest{SourceID: src.ID, TargetID: dst.ID})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{src.ID}, tr.purged)
}

func TestDelete_WithoutTranslatorIsFine(t *testing.T) {
	e := newTestSvc(t)
	tag := e.repo.seedTag("Golang", "golang")
	require.NoError(t, e.svc.DeleteTag(context.Background(), cmstest.ActorWith(permManage), tag.ID))
}

// --- Authorization ---

func TestAuthorizeTranslate_ReusesTheManageGate(t *testing.T) {
	e := newTestSvc(t)
	ctx := context.Background()
	cat := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)

	// Tags have no translation gate: nothing public ever rendered a translated
	// tag, so the entity is not declared and the route 404s before it gets here.
	require.NoError(t, e.svc.AuthorizeTranslateCategory(ctx, cmstest.ActorWith(permManage), cat.ID))

	cmstest.AssertAppErr(t, e.svc.AuthorizeTranslateCategory(ctx, cmstest.ActorWith(permView), cat.ID),
		http.StatusForbidden, "access_denied")
	cmstest.AssertAppErr(t, e.svc.AuthorizeTranslateCategory(ctx, cmstest.ActorWith(permManage), uuid.New()),
		http.StatusNotFound, "not_found")
}

// --- Admin list overlay (console reads in the language of its interface) ---

// listEnv is a service whose translation port is wired, plus that port.
func listEnv(t *testing.T) (*tenv, *fakeTranslator) {
	t.Helper()
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	return e, tr
}

func TestListCategories_ShowsEnglishWhereTranslated(t *testing.T) {
	e, tr := listEnv(t)
	news := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)
	life := e.repo.seedCategory("Đời Sống", "doi-song", nil)
	tr.values[news.ID] = map[string]any{"name": "News"}

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err)
	require.Len(t, tree, 2)
	byID := map[uuid.UUID]CategoryResponse{tree[0].ID: tree[0], tree[1].ID: tree[1]}

	require.Equal(t, "News", byID[news.ID].NameDisplay)
	require.Equal(t, "Đời Sống", byID[life.ID].NameDisplay, "no translation → the row's own name")
}

// The stored name must survive the overlay untouched. The console hydrates the
// category EDITOR from this very response and PATCHes `name` straight back, so
// folding the translation onto it would write English into the Vietnamese row
// on the next save.
func TestListCategories_LeavesTheStoredNameAlone(t *testing.T) {
	e, tr := listEnv(t)
	news := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)
	tr.values[news.ID] = map[string]any{"name": "News"}

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err)
	require.Equal(t, "Tin Tức", tree[0].Name)
	require.Equal(t, "News", tree[0].NameDisplay)
}

// A blank translation is "I have not done this one", not "show nothing".
func TestListCategories_BlankTranslationFallsBack(t *testing.T) {
	e, tr := listEnv(t)
	c := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)
	tr.values[c.ID] = map[string]any{"name": ""}

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err)
	require.Equal(t, "Tin Tức", tree[0].NameDisplay)
}

func TestListCategories_SourceLanguageLooksNothingUp(t *testing.T) {
	for _, locale := range []string{"", "vi"} {
		t.Run("locale="+locale, func(t *testing.T) {
			e, tr := listEnv(t)
			c := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)
			tr.values[c.ID] = map[string]any{"name": "News"}

			tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), locale, "")
			require.NoError(t, err)
			require.Equal(t, 0, tr.calls, "the source language is already in the row")
			require.Equal(t, "Tin Tức", tree[0].NameDisplay)
		})
	}
}

func TestListCategories_ReadsTheWholeTreeInOneCall(t *testing.T) {
	e, tr := listEnv(t)
	for i := 0; i < 20; i++ {
		c := e.repo.seedCategory(fmt.Sprintf("Mục %02d", i), fmt.Sprintf("muc-%02d", i), nil)
		tr.values[c.ID] = map[string]any{"name": fmt.Sprintf("Topic %02d", i)}
	}

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err)
	require.Len(t, tree, 20)
	require.Equal(t, 1, tr.calls, "a 20-row tree must stay one round trip")
	for _, n := range tree {
		require.Equal(t, strings.Replace(n.Name, "Mục", "Topic", 1), n.NameDisplay)
	}
}

func TestListCategories_NoTranslatorStillAnswers(t *testing.T) {
	e := newTestSvc(t) // port never wired
	e.repo.seedCategory("Tin Tức", "tin-tuc", nil)

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err)
	require.Equal(t, "Tin Tức", tree[0].NameDisplay)
}

func TestListCategories_StoreFailureServesVietnamese(t *testing.T) {
	e, tr := listEnv(t)
	c := e.repo.seedCategory("Tin Tức", "tin-tuc", nil)
	tr.values[c.ID] = map[string]any{"name": "News"}
	tr.err = errors.New("translation store down")

	tree, err := e.svc.ListCategories(context.Background(), cmstest.ActorWith(permView), "en", "")
	require.NoError(t, err, "a list that cannot reach the store still answers")
	require.Equal(t, "Tin Tức", tree[0].NameDisplay)
}

// The write endpoints answer with what they persisted, in every language.
func TestCategoryWrites_AnswerWithTheStoredName(t *testing.T) {
	e, tr := listEnv(t)

	created, err := e.svc.CreateCategory(context.Background(), cmstest.ActorWith(permManage), CreateCategoryRequest{Name: "Tin Tức"})
	require.NoError(t, err)
	tr.values[created.ID] = map[string]any{"name": "News"}
	require.Equal(t, "Tin Tức", created.NameDisplay)

	cur, err := e.repo.GetCategory(context.Background(), created.ID)
	require.NoError(t, err)
	name := "Tin Tức Mới"
	updated, err := e.svc.UpdateCategory(context.Background(), cmstest.ActorWith(permManage), created.ID,
		UpdateCategoryRequest{Name: &name, UpdatedAt: &cur.UpdatedAt})
	require.NoError(t, err)
	require.Equal(t, "Tin Tức Mới", updated.Name)
	require.Equal(t, "Tin Tức Mới", updated.NameDisplay)
	require.Equal(t, 0, tr.calls, "an editor response is never localized")
}
