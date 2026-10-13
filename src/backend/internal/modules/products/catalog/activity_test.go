package catalog

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/platform/activity"
)

// fakeRecorder keeps what the service filed, so these tests assert on the row
// itself rather than on a database.
type fakeRecorder struct{ entries []activity.Entry }

func (f *fakeRecorder) Record(_ context.Context, _ *httpx.Identity, e activity.Entry) {
	f.entries = append(f.entries, e)
}

// last is the entry the action under test produced; the create that set the
// test up filed one of its own first.
func (f *fakeRecorder) last(t *testing.T) activity.Entry {
	t.Helper()
	require.NotEmpty(t, f.entries)
	return f.entries[len(f.entries)-1]
}

func recorded(svc *Service) *fakeRecorder {
	rec := &fakeRecorder{}
	svc.SetActivity(rec)
	return rec
}

// The delete is the case that proves the label has to be stored: by the time
// anyone reads the row, the product it names is gone.
func TestActivity_DeleteKeepsTheNameTheRowHad(t *testing.T) {
	svc, repo, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	rec := recorded(svc)
	p := create(t, svc, id, CreateRequest{Name: "Kho Vận"})

	require.NoError(t, svc.Delete(ctx, id, p.ID))

	entry := rec.last(t)
	require.Equal(t, "product.deleted", entry.Action)
	require.Equal(t, EntityProduct, entry.Entity)
	require.Equal(t, p.ID, *entry.EntityID)
	require.Equal(t, "Kho Vận", entry.EntityLabel)
	// The row it describes really is gone, so nothing could join the name back.
	require.NotContains(t, repo.rows, p.ID)
}

func TestActivity_PublishRecordsTheTransition(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	rec := recorded(svc)
	p := create(t, svc, id, CreateRequest{Name: "Kho Vận"})

	_, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	entry := rec.last(t)
	require.Equal(t, "product.published", entry.Action)
	require.Equal(t, "Kho Vận", entry.EntityLabel)
	require.Equal(t, StatusDraft, entry.Metadata["from"])
	require.Equal(t, StatusPublished, entry.Metadata["to"])
}

// Unpublish and archive both leave the public site, and the log keeps them
// apart because they mean different things to whoever reads it later.
func TestActivity_UnpublishAndArchiveAreDistinct(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	rec := recorded(svc)
	p := create(t, svc, id, CreateRequest{Name: "Kho Vận"})
	_, err := svc.Publish(ctx, id, p.ID)
	require.NoError(t, err)

	_, err = svc.Unpublish(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, "product.unpublished", rec.last(t).Action)

	_, err = svc.Archive(ctx, id, p.ID)
	require.NoError(t, err)
	require.Equal(t, "product.archived", rec.last(t).Action)
}

// The recorder is optional by design: every other test in this package runs
// without one, and this is the assertion that keeps that true.
func TestActivity_NilRecorderIsSafe(t *testing.T) {
	svc, _, _ := newSvc(t)
	ctx, id := context.Background(), publisher()
	p := create(t, svc, id, CreateRequest{Name: "Kho Vận"})
	require.NoError(t, svc.Delete(ctx, id, p.ID))
}
