package articles

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
	"github.com/velt/backend/internal/platform/activity"
)

// fakeRecorder keeps what the service filed, so these tests assert on the row
// itself rather than on a database.
type fakeRecorder struct{ entries []activity.Entry }

func (f *fakeRecorder) Record(_ context.Context, _ *httpx.Identity, e activity.Entry) {
	f.entries = append(f.entries, e)
}

// only returns the single entry recorded, failing if there is not exactly one:
// a second row for one action is as wrong as none.
func (f *fakeRecorder) only(t *testing.T) activity.Entry {
	t.Helper()
	require.Len(t, f.entries, 1)
	return f.entries[0]
}

// withRecorder attaches a recorder to the environment's service.
func (e *tenv) withRecorder() *fakeRecorder {
	rec := &fakeRecorder{}
	e.svc.SetActivity(rec)
	return rec
}

// The delete is the case that proves the label has to be stored: by the time
// anyone reads the row, the article it names is gone.
func TestArticles_ActivityDeleteKeepsTheTitleTheRowHad(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("Bài Viết Đầu", "bai-viet-dau", owner, ArticleStatusDraft)
	rec := e.withRecorder()

	require.NoError(t, e.svc.DeleteArticle(context.Background(), editorActor(owner), art.ID))

	entry := rec.only(t)
	require.Equal(t, "article.deleted", entry.Action)
	require.Equal(t, EntityArticle, entry.Entity)
	require.Equal(t, art.ID, *entry.EntityID)
	require.Equal(t, "Bài Viết Đầu", entry.EntityLabel)
	require.Equal(t, ArticleStatusDraft, entry.Metadata["status"])
	// The row it describes really is gone, so nothing could join the title back.
	_, err := e.repo.GetArticle(context.Background(), art.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestArticles_ActivityPublishRecordsTheTransition(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusDraft)
	rec := e.withRecorder()

	_, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusPublished)})
	require.NoError(t, err)

	entry := rec.only(t)
	require.Equal(t, "article.published", entry.Action)
	require.Equal(t, ArticleStatusDraft, entry.Metadata["from"])
	require.Equal(t, ArticleStatusPublished, entry.Metadata["to"])
}

func TestArticles_ActivityUnpublishRecordsTheTransition(t *testing.T) {
	e := newTestSvc(t)
	art := e.repo.seedArticle("A", "a", uuid.New(), ArticleStatusPublished)
	rec := e.withRecorder()

	_, err := e.svc.UpdateArticle(context.Background(), reviewerActor(), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Status: cmstest.Strptr(ArticleStatusArchived)})
	require.NoError(t, err)

	entry := rec.only(t)
	require.Equal(t, "article.unpublished", entry.Action)
	require.Equal(t, ArticleStatusArchived, entry.Metadata["to"])
}

// A content edit that leaves the status alone is an update, and carries no
// transition to pretend otherwise.
func TestArticles_ActivityContentEditIsPlainUpdate(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	rec := e.withRecorder()

	_, err := e.svc.UpdateArticle(context.Background(), editorActor(owner), art.ID,
		UpdateArticleRequest{UpdatedAt: &art.UpdatedAt, Title: cmstest.Strptr("B")})
	require.NoError(t, err)

	entry := rec.only(t)
	require.Equal(t, "article.updated", entry.Action)
	require.Equal(t, "B", entry.EntityLabel)
	require.Nil(t, entry.Metadata)
}

// The recorder is optional by design: every other test in this package runs
// without one, and this is the assertion that keeps that true.
func TestArticles_ActivityNilRecorderIsSafe(t *testing.T) {
	e := newTestSvc(t)
	owner := uuid.New()
	art := e.repo.seedArticle("A", "a", owner, ArticleStatusDraft)
	require.NoError(t, e.svc.DeleteArticle(context.Background(), editorActor(owner), art.ID))
}
