package catalog

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// seedLocaleList makes two products — one with an English translation, one
// without — and returns the service and both ids.
func seedLocaleList(t *testing.T) (*Service, *fakeTranslator, uuid.UUID, uuid.UUID) {
	t.Helper()
	svc, _, _ := newSvc(t)
	one := create(t, svc, author(), CreateRequest{
		Name: "Kho Gọn", Slug: str("kho-gon"), Summary: str("Quản lý kho đơn giản."),
	})
	two := create(t, svc, author(), CreateRequest{
		Name: "Máy Chấm Công", Slug: str("may-cham-cong"), Summary: str("Chấm công."),
	})
	tr := &fakeTranslator{
		locales: []string{"en"},
		values: map[uuid.UUID]map[string]map[string]any{one.ID: {"en": {
			"name": "Lean Stock", "slug": "lean-stock", "summary": "Simple stock control.",
		}}},
	}
	svc.SetTranslator(tr)
	return svc, tr, one.ID, two.ID
}

func listByID(t *testing.T, svc *Service, p ListParams) map[uuid.UUID]ListItem {
	t.Helper()
	res, err := svc.List(context.Background(), author(), p)
	require.NoError(t, err)
	out := map[uuid.UUID]ListItem{}
	for _, item := range res.Items {
		out[item.ID] = item
	}
	return out
}

// Reading the console in English shows the English text where somebody wrote
// one, and the Vietnamese row where nobody did.
func TestList_OverlaysTheTranslationAndFallsBackPerRow(t *testing.T) {
	svc, tr, translated, plain := seedLocaleList(t)

	items := listByID(t, svc, ListParams{Locale: "en"})
	require.Equal(t, 1, tr.calls, "one bundle for the whole page, not one per row")

	require.Equal(t, "Lean Stock", items[translated].Name)
	require.Equal(t, "Simple stock control.", *items[translated].Summary)
	// The slug is the record's address in the console and stays as stored,
	// even for a product whose English slug exists — the editor writes that
	// field, and a different one per reader reads as a rename nobody made.
	require.Equal(t, "kho-gon", items[translated].Slug)

	require.Equal(t, "Máy Chấm Công", items[plain].Name)
	require.Equal(t, "may-cham-cong", items[plain].Slug)
	require.Equal(t, "Chấm công.", *items[plain].Summary)
}

// A field left blank in the translation form means "not done yet", not "clear
// this row".
func TestList_BlankTranslationFallsBack(t *testing.T) {
	svc, tr, translated, _ := seedLocaleList(t)
	tr.values[translated]["en"]["summary"] = ""

	items := listByID(t, svc, ListParams{Locale: "en"})
	require.Equal(t, "Lean Stock", items[translated].Name)
	require.Equal(t, "Quản lý kho đơn giản.", *items[translated].Summary)
}

func TestList_SourceLanguageLooksNothingUp(t *testing.T) {
	for _, locale := range []string{"", "vi"} {
		svc, tr, translated, _ := seedLocaleList(t)
		items := listByID(t, svc, ListParams{Locale: locale})
		require.Zero(t, tr.calls, "locale %q must not reach the translation store", locale)
		require.Equal(t, "Kho Gọn", items[translated].Name)
	}
}

// A list that cannot reach the translation store still answers; it just
// answers in Vietnamese.
func TestList_WithoutATranslatorIsVietnamese(t *testing.T) {
	svc, _, _ := newSvc(t)
	one := create(t, svc, author(), CreateRequest{Name: "Kho Gọn"})
	items := listByID(t, svc, ListParams{Locale: "en"})
	require.Equal(t, "Kho Gọn", items[one.ID].Name)
}

// The editor reads Get, and Get has no language: it must keep handing the form
// the product's own columns, or the next save writes English into them.
func TestGet_IsNeverTranslated(t *testing.T) {
	svc, _, translated, _ := seedLocaleList(t)

	items := listByID(t, svc, ListParams{Locale: "en"})
	require.Equal(t, "Lean Stock", items[translated].Name)

	got, err := svc.Get(context.Background(), author(), translated)
	require.NoError(t, err)
	require.Equal(t, "Kho Gọn", got.Name)
	require.Equal(t, "kho-gon", got.Slug)
	require.Equal(t, "Quản lý kho đơn giản.", *got.Summary)
}
