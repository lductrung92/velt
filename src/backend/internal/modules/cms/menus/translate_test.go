package menus

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeTranslator is an in-memory Translator. It counts Bundle calls so a test
// can prove a whole item tree is one round trip rather than one per item.
type fakeTranslator struct {
	values map[uuid.UUID]map[string]any
	calls  int
	err    error
}

func newFakeTranslator() *fakeTranslator {
	return &fakeTranslator{values: map[uuid.UUID]map[string]any{}}
}

func (f *fakeTranslator) Bundle(_ context.Context, _ string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	out := map[uuid.UUID]map[string]map[string]any{}
	for _, id := range ids {
		if v, ok := f.values[id]; ok {
			out[id] = map[string]map[string]any{locales[0]: v}
		}
	}
	return out, nil
}

// seedMenu builds a slot with the given root labels and returns it plus the
// saved items, whose ids a translation hangs from.
func seedMenu(t *testing.T, e *tenv, labels ...string) (Response, []ItemNode) {
	t.Helper()
	m, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	require.NoError(t, err)
	items := make([]ItemInput, 0, len(labels))
	for _, l := range labels {
		items = append(items, ItemInput{Label: l, LinkType: LinkInternal, URL: cmstest.Strptr("/")})
	}
	saved, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID, ItemsRequest{Items: items}, "")
	require.NoError(t, err)
	return m, saved.Items
}

func translateEnv(t *testing.T) (*tenv, *fakeTranslator) {
	t.Helper()
	e := newTestSvc(t)
	tr := newFakeTranslator()
	e.svc.SetTranslator(tr)
	return e, tr
}

func TestGetMenu_ShowsEnglishWhereTranslated(t *testing.T) {
	e, tr := translateEnv(t)
	m, items := seedMenu(t, e, "Trang Chủ", "Liên Hệ")
	tr.values[items[0].ID] = map[string]any{"label": "Home"}

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, "Home", got.Items[0].LabelDisplay)
	require.Equal(t, "Liên Hệ", got.Items[1].LabelDisplay, "no translation → the item's own label")
}

// The stored label must survive the overlay untouched. The builder hydrates its
// draft from this response and PUTs the whole tree back, so folding the
// translation onto Label would overwrite every Vietnamese label on the next
// save.
func TestGetMenu_LeavesTheStoredLabelAlone(t *testing.T) {
	e, tr := translateEnv(t)
	m, items := seedMenu(t, e, "Trang Chủ")
	tr.values[items[0].ID] = map[string]any{"label": "Home"}

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, "Trang Chủ", got.Items[0].Label)
	require.Equal(t, "Home", got.Items[0].LabelDisplay)
}

// A save made while reading in English persists the label it was SENT. This is
// the whole point of the display field: the builder PUTs its draft back, and a
// draft built from LabelDisplay would quietly replace the Vietnamese.
//
// (The save answers through the same menuDetail helper the GetMenu tests above
// cover, so only the stored side is asserted here.)
func TestReplaceMenuItems_PersistsTheLabelItWasSent(t *testing.T) {
	e, tr := translateEnv(t)
	m, items := seedMenu(t, e, "Trang Chủ")
	tr.values[items[0].ID] = map[string]any{"label": "Home"}

	saved, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID,
		ItemsRequest{Items: []ItemInput{{ID: &items[0].ID, Label: "Trang Chủ", LinkType: LinkInternal, URL: cmstest.Strptr("/")}}}, "en")
	require.NoError(t, err)
	require.Equal(t, "Trang Chủ", saved.Items[0].Label, "the row keeps what was written to it")

	// And it is still Vietnamese when the same tree is read in the source language.
	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "vi")
	require.NoError(t, err)
	require.Equal(t, "Trang Chủ", got.Items[0].Label)
	require.Equal(t, "Trang Chủ", got.Items[0].LabelDisplay)
}

// A blank translation is "I have not done this one", not "show nothing".
func TestGetMenu_BlankTranslationFallsBack(t *testing.T) {
	e, tr := translateEnv(t)
	m, items := seedMenu(t, e, "Trang Chủ")
	tr.values[items[0].ID] = map[string]any{"label": ""}

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, "Trang Chủ", got.Items[0].LabelDisplay)
}

func TestGetMenu_SourceLanguageLooksNothingUp(t *testing.T) {
	for _, locale := range []string{"", "vi"} {
		t.Run("locale="+locale, func(t *testing.T) {
			e, tr := translateEnv(t)
			m, items := seedMenu(t, e, "Trang Chủ")
			tr.values[items[0].ID] = map[string]any{"label": "Home"}
			tr.calls = 0 // the seed save read the tree back

			got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, locale)
			require.NoError(t, err)
			require.Equal(t, 0, tr.calls, "the source language is already in the row")
			require.Equal(t, "Trang Chủ", got.Items[0].LabelDisplay)
		})
	}
}

func TestGetMenu_ReadsTheWholeTreeInOneCall(t *testing.T) {
	e, tr := translateEnv(t)
	labels := make([]string, 20)
	for i := range labels {
		labels[i] = fmt.Sprintf("Mục %02d", i)
	}
	m, items := seedMenu(t, e, labels...)
	for i, it := range items {
		tr.values[it.ID] = map[string]any{"label": fmt.Sprintf("Item %02d", i)}
	}
	tr.calls = 0

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, 1, tr.calls, "a 20-item tree must stay one round trip")
	for i, n := range got.Items {
		require.Equal(t, fmt.Sprintf("Item %02d", i), n.LabelDisplay)
	}
}

func TestGetMenu_NoTranslatorStillAnswers(t *testing.T) {
	e := newTestSvc(t) // port never wired
	m, _ := seedMenu(t, e, "Trang Chủ")

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, "Trang Chủ", got.Items[0].LabelDisplay)
}

func TestGetMenu_StoreFailureServesVietnamese(t *testing.T) {
	e, tr := translateEnv(t)
	m, items := seedMenu(t, e, "Trang Chủ")
	tr.values[items[0].ID] = map[string]any{"label": "Home"}
	tr.err = errors.New("translation store down")

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err, "a menu that cannot reach the store still answers")
	require.Equal(t, "Trang Chủ", got.Items[0].LabelDisplay)
}

// A child is overlaid like a root: the lookup covers every row of the tree, not
// just the top level.
func TestGetMenu_TranslatesNestedItems(t *testing.T) {
	e, tr := translateEnv(t)
	m, err := e.svc.CreateMenu(context.Background(), cmstest.ActorWith(permManage), CreateRequest{Name: "H", Location: "header"})
	require.NoError(t, err)
	saved, err := e.svc.ReplaceMenuItems(context.Background(), cmstest.ActorWith(permManage), m.ID, ItemsRequest{Items: []ItemInput{
		{Label: "Dịch Vụ", LinkType: LinkInternal, URL: cmstest.Strptr("/"), Children: []ItemInput{
			{Label: "Tư Vấn", LinkType: LinkInternal, URL: cmstest.Strptr("/tu-van")},
		}},
	}}, "")
	require.NoError(t, err)
	tr.values[saved.Items[0].Children[0].ID] = map[string]any{"label": "Consulting"}

	got, err := e.svc.GetMenu(context.Background(), cmstest.ActorWith(permManage), m.ID, "en")
	require.NoError(t, err)
	require.Equal(t, "Dịch Vụ", got.Items[0].LabelDisplay)
	require.Equal(t, "Consulting", got.Items[0].Children[0].LabelDisplay)
	require.Equal(t, "Tư Vấn", got.Items[0].Children[0].Label)
}
