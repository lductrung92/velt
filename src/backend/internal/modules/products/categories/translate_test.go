package categories

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// fakeTranslator is an in-memory Translator. This package has no public read, so
// only the delete and authorize paths exercise it.
type fakeTranslator struct {
	purged []uuid.UUID
}

func (f *fakeTranslator) Locales(context.Context) []string { return []string{"en"} }

func (f *fakeTranslator) Bundle(context.Context, string, []uuid.UUID, []string) (map[uuid.UUID]map[string]map[string]any, error) {
	return nil, nil
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
