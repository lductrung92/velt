package categories

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// fakeTranslator is an in-memory Translator. It counts Bundle calls so a test
// can prove the console list is one round trip rather than one per category.
type fakeTranslator struct {
	values map[uuid.UUID]map[string]any
	calls  int
	purged []uuid.UUID
}

func (f *fakeTranslator) Locales(context.Context) []string { return []string{"en"} }

func (f *fakeTranslator) Bundle(_ context.Context, _ string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	f.calls++
	out := map[uuid.UUID]map[string]map[string]any{}
	for _, id := range ids {
		if v, ok := f.values[id]; ok {
			out[id] = map[string]map[string]any{locales[0]: v}
		}
	}
	return out, nil
}

func (f *fakeTranslator) Purge(_ context.Context, _ string, id uuid.UUID) error {
	f.purged = append(f.purged, id)
	return nil
}

func TestDelete_PurgesTranslations(t *testing.T) {
	svc, _ := newSvc(t)
	tr := &fakeTranslator{}
	svc.SetTranslator(tr)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho Gọn"})
	require.NoError(t, err)

	require.NoError(t, svc.Delete(ctx, manager(), created.ID))
	require.Equal(t, []uuid.UUID{created.ID}, tr.purged)
}

func TestDelete_WithoutTranslatorIsFine(t *testing.T) {
	svc, _ := newSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho Gọn"})
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, manager(), created.ID))
}

func TestAuthorizeTranslate_ReusesTheManageGate(t *testing.T) {
	svc, _ := newSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho Gọn"})
	require.NoError(t, err)

	require.NoError(t, svc.AuthorizeTranslate(ctx, manager(), created.ID))
	require.Equal(t, 403, status(t, svc.AuthorizeTranslate(ctx, viewer(), created.ID)))
	require.Equal(t, 404, status(t, svc.AuthorizeTranslate(ctx, manager(), uuid.New())))
}

// --- Console list ---

// Reading the console in English shows the English name where somebody wrote
// one, and the Vietnamese name where nobody did.
func TestList_OverlaysTheTranslationAndFallsBackPerRow(t *testing.T) {
	svc, _ := newSvc(t)
	tr := &fakeTranslator{values: map[uuid.UUID]map[string]any{}}
	svc.SetTranslator(tr)
	ctx := context.Background()
	one, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho vận"})
	require.NoError(t, err)
	two, err := svc.Create(ctx, manager(), CreateRequest{Name: "Nhân sự"})
	require.NoError(t, err)
	tr.values[one.ID] = map[string]any{"name": "Logistics"}

	res, err := svc.List(ctx, manager(), "en", "")
	require.NoError(t, err)
	require.Equal(t, 1, tr.calls, "one bundle for the whole taxonomy")

	byID := map[uuid.UUID]Response{}
	for _, c := range res.Items {
		byID[c.ID] = c
	}
	// The translation lands in NameDisplay; Name keeps the stored Vietnamese,
	// because this same response hydrates the category editor's form and the
	// next save writes Name straight back.
	require.Equal(t, "Logistics", byID[one.ID].NameDisplay)
	require.Equal(t, "Kho vận", byID[one.ID].Name)
	require.Equal(t, "Nhân sự", byID[two.ID].NameDisplay)
	require.Equal(t, "Nhân sự", byID[two.ID].Name)
	// The slug is the category's address and is not declared translatable.
	require.Equal(t, "kho-van", byID[one.ID].Slug)
}

func TestList_SourceLanguageLooksNothingUp(t *testing.T) {
	for _, locale := range []string{"", "vi"} {
		svc, _ := newSvc(t)
		tr := &fakeTranslator{values: map[uuid.UUID]map[string]any{}}
		svc.SetTranslator(tr)
		ctx := context.Background()
		created, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho vận"})
		require.NoError(t, err)
		tr.values[created.ID] = map[string]any{"name": "Logistics"}

		res, err := svc.List(ctx, manager(), locale, "")
		require.NoError(t, err)
		require.Zero(t, tr.calls, "locale %q must not reach the translation store", locale)
		require.Equal(t, "Kho vận", res.Items[0].Name)
		require.Equal(t, "Kho vận", res.Items[0].NameDisplay)
	}
}

// A list that cannot reach the translation store still answers; it just
// answers in Vietnamese.
func TestList_WithoutATranslatorIsVietnamese(t *testing.T) {
	svc, _ := newSvc(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, manager(), CreateRequest{Name: "Kho vận"})
	require.NoError(t, err)

	res, err := svc.List(ctx, manager(), "en", "")
	require.NoError(t, err)
	require.Equal(t, "Kho vận", res.Items[0].Name)
	require.Equal(t, "Kho vận", res.Items[0].NameDisplay)
}
