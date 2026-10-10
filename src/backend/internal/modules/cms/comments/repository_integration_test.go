package comments

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestIT_CommentModerationAndDelete(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_articles WHERE title LIKE 'cmsit-%'`) // comments cascade
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'cmsit-%@x.test'`)
	})

	var author uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'CMS IT') RETURNING id`,
		"cmsit-"+uuid.NewString()+"@x.test").Scan(&author))
	var article uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO cms_articles (title, slug, author_id, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
		"cmsit-article", "cmsit-"+uuid.NewString(), author).Scan(&article))

	var cid uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO cms_comments (article_id, author_name, author_email, body, status)
		 VALUES ($1, 'cmsit-commenter', 'cmsit-c@x.test', 'hello', 'pending') RETURNING id`, article).Scan(&cid))

	// list pending for the article (joins the article title)
	rows, total, err := repo.List(ctx, ListParams{Status: StatusPending, ArticleID: &article, Page: 1, PageSize: 20})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, "cmsit-article", rows[0].ArticleTitle)
	require.NotNil(t, rows[0].AuthorEmail)

	// approve → approved_at set
	_, err = repo.UpdateStatus(ctx, cid, StatusApproved)
	require.NoError(t, err)
	got, err := repo.GetRow(ctx, cid)
	require.NoError(t, err)
	require.Equal(t, StatusApproved, got.Status)
	require.NotNil(t, got.ApprovedAt)

	// spam → approved_at cleared
	_, err = repo.UpdateStatus(ctx, cid, StatusSpam)
	require.NoError(t, err)
	got, err = repo.GetRow(ctx, cid)
	require.NoError(t, err)
	require.Nil(t, got.ApprovedAt)

	// delete → gone
	require.NoError(t, repo.Delete(ctx, cid))
	_, err = repo.GetRow(ctx, cid)
	require.ErrorIs(t, err, shared.ErrNotFound)
}
