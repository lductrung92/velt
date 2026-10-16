package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
)

// fakeTranslator stands in for the translation module: a bundle of values per
// record and language, and nothing else this package may rely on.
type fakeTranslator struct {
	locales []string
	values  map[uuid.UUID]map[string]map[string]any
	err     error
	purged  []uuid.UUID
	// calls counts Bundle calls, so a test can prove a list page costs one
	// round trip rather than one per row.
	calls int
}

func (f *fakeTranslator) Locales(context.Context) []string { return f.locales }

func (f *fakeTranslator) Bundle(_ context.Context, _ string, _ []uuid.UUID, _ []string) (map[uuid.UUID]map[string]map[string]any, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.values, nil
}

func (f *fakeTranslator) Purge(_ context.Context, _ string, id uuid.UUID) error {
	f.purged = append(f.purged, id)
	return nil
}

// baseSnapshot is the decoded frozen body a published product carries.
func baseSnapshot() map[string]any {
	return map[string]any{
		"slug": "kho-gon", "name": "Kho Gọn", "summary": "Quản lý kho đơn giản.",
		"body_html": "<p>Giới thiệu</p>",
		"seo":       map[string]any{"title": "Kho Gọn", "description": "Mô tả"},
	}
}

func decodeDoc(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

func TestSearchTextIsNameAndSummaryOnly(t *testing.T) {
	require.Equal(t, "Kho Gọn Quản lý kho đơn giản.", searchText(baseSnapshot()))
	// A product with no summary still indexes under its name.
	require.Equal(t, "Kho Gọn", searchText(map[string]any{"name": "Kho Gọn", "summary": "  "}))
	// The long body is not searchable: it would make every product match almost
	// anything.
	require.NotContains(t, searchText(baseSnapshot()), "Giới thiệu")
}

func TestTranslatedDocsFallBackToSourceValues(t *testing.T) {
	svc, _, _ := newSvc(t)
	id := uuid.New()
	svc.SetTranslator(&fakeTranslator{
		locales: []string{"en"},
		values: map[uuid.UUID]map[string]map[string]any{id: {"en": {
			"name": "Lean Stock", "summary": "   ",
			"seo": map[string]any{"title": "Lean Stock"},
		}}},
	})

	docs := svc.translatedDocs(context.Background(), &Product{ID: id, Slug: "kho-gon"}, baseSnapshot(), testNow)
	require.Len(t, docs, 1)
	body := decodeDoc(t, docs[0].Body)

	require.Equal(t, "Lean Stock", body["name"])
	// Blank translation → the Vietnamese value, never an empty field.
	require.Equal(t, "Quản lý kho đơn giản.", body["summary"])
	// A nested block is overlaid key by key, not replaced whole.
	require.Equal(t, "Mô tả", body["seo"].(map[string]any)["description"])
	// No translated slug → the page exists anyway, under the source slug.
	require.Equal(t, "kho-gon", docs[0].Slug)
	require.Equal(t, "kho-gon", body["slug"])
	require.Equal(t, "Lean Stock Quản lý kho đơn giản.", docs[0].SearchText)
}

func TestTranslatedDocsUseTranslatedSlug(t *testing.T) {
	svc, _, _ := newSvc(t)
	id := uuid.New()
	svc.SetTranslator(&fakeTranslator{
		locales: []string{"en"},
		values:  map[uuid.UUID]map[string]map[string]any{id: {"en": {"slug": " lean-stock "}}},
	})

	docs := svc.translatedDocs(context.Background(), &Product{ID: id, Slug: "kho-gon"}, baseSnapshot(), testNow)
	require.Len(t, docs, 1)
	require.Equal(t, "lean-stock", docs[0].Slug)
	require.Equal(t, "lean-stock", decodeDoc(t, docs[0].Body)["slug"])
}

func TestTranslatedDocsSurviveATranslationFailure(t *testing.T) {
	// Losing the translated copy of one publish beats being unable to publish.
	svc, _, _ := newSvc(t)
	svc.SetTranslator(&fakeTranslator{locales: []string{"en"}, err: errors.New("boom")})

	require.Empty(t, svc.translatedDocs(context.Background(), &Product{ID: uuid.New(), Slug: "kho-gon"}, baseSnapshot(), testNow))
}

func TestTranslatedDocsWithoutTranslator(t *testing.T) {
	svc, _, _ := newSvc(t)
	require.Empty(t, svc.translatedDocs(context.Background(), &Product{ID: uuid.New(), Slug: "kho-gon"}, baseSnapshot(), testNow))
}

func TestAuthorizeTranslateReusesTheEditGate(t *testing.T) {
	svc, _, _ := newSvc(t)
	p := create(t, svc, author(), CreateRequest{Name: "Kho Gọn"})
	ctx := context.Background()

	require.NoError(t, svc.AuthorizeTranslate(ctx, author(), p.ID))

	viewer := &httpx.Identity{UserID: uuid.New(), Permissions: []string{permView}}
	require.Equal(t, 403, status(t, svc.AuthorizeTranslate(ctx, viewer, p.ID)))
	require.Equal(t, 401, status(t, svc.AuthorizeTranslate(ctx, nil, p.ID)))
	// A product that does not exist is a 404, not a row nothing will publish.
	require.Equal(t, 404, status(t, svc.AuthorizeTranslate(ctx, author(), uuid.New())))
}
