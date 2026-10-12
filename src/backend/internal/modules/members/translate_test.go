package members

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// fakeTranslator is an in-memory Translator. It counts Bundle calls so a test
// can prove a list page is one round trip rather than one per row.
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

func newTranslatedSvc(t *testing.T) (*Service, *fakeRepo, *fakeTranslator) {
	t.Helper()
	svc, repo, _ := newSvc(t)
	tr := newFakeTranslator()
	svc.SetTranslator(tr)
	return svc, repo, tr
}

// --- Fallback ---

func TestGetPublicBySlug_FallsBackPerField(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{
		FullName: "Trần An", Role: str("Kỹ sư"), Bio: str("Tiểu sử"),
	})
	require.NoError(t, err)
	// Role translated, bio left blank — the blank one must not blank the page.
	tr.values[created.ID] = map[string]any{"role": "Engineer", "bio": "   "}

	res, err := svc.GetPublicBySlug(ctx, "en", created.Slug)
	require.NoError(t, err)
	require.Equal(t, "Engineer", *res.Role)
	require.Equal(t, "Tiểu sử", *res.Bio)
}

func TestGetPublicBySlug_UnknownLocaleServesVietnamese(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A", Role: str("Kỹ sư")})
	require.NoError(t, err)
	tr.values[created.ID] = map[string]any{"role": "Engineer"}

	res, err := svc.GetPublicBySlug(ctx, "fr", created.Slug)
	require.NoError(t, err)
	require.Equal(t, "Kỹ sư", *res.Role)
	require.Zero(t, tr.calls, "an unoffered language must not reach the store")
}

func TestListPublic_TranslationFailureStillServesTheRoster(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A", Role: str("Kỹ sư")})
	require.NoError(t, err)
	tr.err = errors.New("store down")

	res, err := svc.ListPublic(ctx, ListParams{Locale: "en"})
	require.NoError(t, err)
	require.Equal(t, "Kỹ sư", *res.Items[0].Role)
}

// --- Batch load ---

func TestListPublic_LoadsEveryTranslationInOneCall(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	for i := range 20 {
		created, err := svc.Create(ctx, manager(), CreateRequest{
			FullName: fmt.Sprintf("Member %02d", i), Role: str("Kỹ sư"),
		})
		require.NoError(t, err)
		tr.values[created.ID] = map[string]any{"role": fmt.Sprintf("Engineer %02d", i)}
	}

	res, err := svc.ListPublic(ctx, ListParams{Locale: "en", PageSize: 20})
	require.NoError(t, err)
	require.Len(t, res.Items, 20)
	require.Equal(t, 1, tr.calls, "a 20-row roster must stay one round trip")
	for i := range res.Items {
		require.Equal(t, fmt.Sprintf("Engineer %02d", i), *res.Items[i].Role)
	}
}

func TestListPublic_VietnameseNeverTouchesTheStore(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A"})
	require.NoError(t, err)

	_, err = svc.ListPublic(ctx, ListParams{})
	require.NoError(t, err)
	require.Zero(t, tr.calls)
}

// --- Port is optional ---

func TestListPublic_WithoutTranslatorServesVietnamese(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A", Role: str("Kỹ sư")})
	require.NoError(t, err)

	res, err := svc.ListPublic(ctx, ListParams{Locale: "en"})
	require.NoError(t, err)
	require.Equal(t, "Kỹ sư", *res.Items[0].Role)
}

// --- Purge ---

func TestDelete_PurgesTranslations(t *testing.T) {
	svc, _, tr := newTranslatedSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A"})
	require.NoError(t, err)

	require.NoError(t, svc.Delete(ctx, manager(), created.ID))
	require.Equal(t, []uuid.UUID{created.ID}, tr.purged)
}

// --- Authorization ---

func TestAuthorizeTranslate_ReusesTheManageGate(t *testing.T) {
	svc, _, _ := newTranslatedSvc(t)
	ctx := context.Background()
	created, err := svc.Create(ctx, manager(), CreateRequest{FullName: "A"})
	require.NoError(t, err)

	require.NoError(t, svc.AuthorizeTranslate(ctx, manager(), created.ID))
	require.Equal(t, 403, status(t, svc.AuthorizeTranslate(ctx, viewer(), created.ID)))
	require.Equal(t, 404, status(t, svc.AuthorizeTranslate(ctx, manager(), uuid.New())))
}
