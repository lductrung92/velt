package taxonomy

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func taxonomyDB(t *testing.T) (Repository, *pgxpool.Pool) {
	t.Helper()
	pool := cmstest.RequireDB(t)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_articles WHERE title LIKE 'cmsit-%'`) // article_tags cascade
		_, _ = pool.Exec(ctx, `DELETE FROM cms_categories WHERE slug LIKE 'cmsit-%'`)
		_, _ = pool.Exec(ctx, `DELETE FROM cms_tags WHERE slug LIKE 'cmsit-%'`)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'cmsit-%@x.test'`)
	})
	return NewRepository(pool), pool
}

// itCat is a plain, in-use category: status is NOT NULL with a CHECK, so a
// write always carries one.
func itCat(slug string) categoryWrite {
	return categoryWrite{Name: "CMS IT", Slug: slug, Status: CategoryStatusPublished}
}

func itUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'CMS IT') RETURNING id`,
		"cmsit-"+uuid.NewString()+"@x.test").Scan(&id))
	return id
}

func itArticle(t *testing.T, pool *pgxpool.Pool, author uuid.UUID, category *uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO cms_articles (title, slug, author_id, category_id, status)
		 VALUES ($1, $2, $3, $4, 'draft') RETURNING id`,
		"cmsit-article", "cmsit-"+uuid.NewString(), author, category).Scan(&id))
	return id
}

func TestIT_CategoryCRUDAndCounts(t *testing.T) {
	repo, pool := taxonomyDB(t)
	ctx := context.Background()

	root, err := repo.CreateCategory(ctx, itCat("cmsit-root-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itCat("cmsit-child-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreateCategory(ctx, cw)
	require.NoError(t, err)

	author := itUser(t, pool)
	_ = itArticle(t, pool, author, &root.ID)

	count, err := repo.CategoryArticleCount(ctx, root.ID)
	require.NoError(t, err)
	require.Equal(t, 1, count)

	hasChildren, err := repo.CategoryHasChildren(ctx, root.ID)
	require.NoError(t, err)
	require.True(t, hasChildren)
	leaf, err := repo.CategoryHasChildren(ctx, child.ID)
	require.NoError(t, err)
	require.False(t, leaf)

	upd := itCat("cmsit-renamed-" + uuid.NewString()[:8])
	upd.Name = "Renamed"
	updated, err := repo.UpdateCategory(ctx, child.ID, upd, child.UpdatedAt, false)
	require.NoError(t, err)
	require.Equal(t, "Renamed", updated.Name)

	require.NoError(t, repo.DeleteCategory(ctx, child.ID))
	_, err = repo.GetCategory(ctx, child.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestIT_DeleteCategoryWithArticleRefuses(t *testing.T) {
	repo, pool := taxonomyDB(t)
	ctx := context.Background()
	cat, err := repo.CreateCategory(ctx, itCat("cmsit-del-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	author := itUser(t, pool)
	article := itArticle(t, pool, author, &cat.ID)

	require.ErrorIs(t, repo.DeleteCategory(ctx, cat.ID), shared.ErrInUse)

	_, err = repo.GetCategory(ctx, cat.ID)
	require.NoError(t, err)
	var catID *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT category_id FROM cms_articles WHERE id = $1`, article).Scan(&catID))
	require.NotNil(t, catID)
	require.Equal(t, cat.ID, *catID)
}

func TestIT_CategoryCycleDetection(t *testing.T) {
	repo, _ := taxonomyDB(t)
	ctx := context.Background()
	root, err := repo.CreateCategory(ctx, itCat("cmsit-cyc-root-"+uuid.NewString()[:8]))
	require.NoError(t, err)
	cw := itCat("cmsit-cyc-child-" + uuid.NewString()[:8])
	cw.ParentID = &root.ID
	child, err := repo.CreateCategory(ctx, cw)
	require.NoError(t, err)

	cyc, err := repo.CategoryCreatesCycle(ctx, root.ID, child.ID)
	require.NoError(t, err)
	require.True(t, cyc)

	self, err := repo.CategoryCreatesCycle(ctx, root.ID, root.ID)
	require.NoError(t, err)
	require.True(t, self)

	ok, err := repo.CategoryCreatesCycle(ctx, child.ID, root.ID)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestIT_CategorySlugUnique(t *testing.T) {
	repo, _ := taxonomyDB(t)
	ctx := context.Background()
	slug := "cmsit-uniq-" + uuid.NewString()[:8]
	_, err := repo.CreateCategory(ctx, itCat(slug))
	require.NoError(t, err)
	_, err = repo.CreateCategory(ctx, itCat(slug))
	require.ErrorIs(t, err, shared.ErrConflict)
}

func TestIT_TagCRUDAndUsage(t *testing.T) {
	repo, pool := taxonomyDB(t)
	ctx := context.Background()

	tag, err := repo.CreateTag(ctx, "CMS IT", "cmsit-tag-"+uuid.NewString()[:8])
	require.NoError(t, err)

	n, err := repo.TagUsageCount(ctx, tag.ID)
	require.NoError(t, err)
	require.Equal(t, 0, n)

	author := itUser(t, pool)
	article := itArticle(t, pool, author, nil)
	_, err = pool.Exec(ctx, `INSERT INTO cms_article_tags (article_id, tag_id) VALUES ($1, $2)`, article, tag.ID)
	require.NoError(t, err)

	n, err = repo.TagUsageCount(ctx, tag.ID)
	require.NoError(t, err)
	require.Equal(t, 1, n)

	_, err = repo.CreateTag(ctx, "Dup", tag.Slug)
	require.ErrorIs(t, err, shared.ErrConflict)
}

func TestIT_TagMergeDedupesAndDeletesSource(t *testing.T) {
	repo, pool := taxonomyDB(t)
	ctx := context.Background()
	src, err := repo.CreateTag(ctx, "Src", "cmsit-src-"+uuid.NewString()[:8])
	require.NoError(t, err)
	dst, err := repo.CreateTag(ctx, "Dst", "cmsit-dst-"+uuid.NewString()[:8])
	require.NoError(t, err)

	author := itUser(t, pool)
	a1 := itArticle(t, pool, author, nil) // tagged source only
	a2 := itArticle(t, pool, author, nil) // tagged BOTH (overlap → must dedup)
	for _, pair := range [][2]uuid.UUID{{a1, src.ID}, {a2, src.ID}, {a2, dst.ID}} {
		_, err = pool.Exec(ctx, `INSERT INTO cms_article_tags (article_id, tag_id) VALUES ($1, $2)`, pair[0], pair[1])
		require.NoError(t, err)
	}

	require.NoError(t, repo.MergeTags(ctx, src.ID, dst.ID))

	_, err = repo.GetTag(ctx, src.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
	n, err := repo.TagUsageCount(ctx, dst.ID)
	require.NoError(t, err)
	require.Equal(t, 2, n)

	var srcRows int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM cms_article_tags WHERE tag_id = $1`, src.ID).Scan(&srcRows))
	require.Equal(t, 0, srcRows)
}

// A row written the way every row predating the status column was written — no
// status at all — must come back published, not draft.
func TestIT_CategoryStatusDefaultsToPublishedForExistingRows(t *testing.T) {
	repo, pool := taxonomyDB(t)
	ctx := context.Background()

	slug := "cmsit-legacy-" + uuid.NewString()[:8]
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO cms_categories (name, slug) VALUES ('CMS IT', $1) RETURNING id`, slug).Scan(&id))

	got, err := repo.GetCategory(ctx, id)
	require.NoError(t, err)
	require.Equal(t, CategoryStatusPublished, got.Status)
}

func TestIT_CategoryStatusRoundTripsAndFiltersTheList(t *testing.T) {
	repo, _ := taxonomyDB(t)
	ctx := context.Background()

	liveW := itCat("cmsit-live-" + uuid.NewString()[:8])
	liveW.Status = CategoryStatusPublished
	live, err := repo.CreateCategory(ctx, liveW)
	require.NoError(t, err)

	draftW := itCat("cmsit-draft-" + uuid.NewString()[:8])
	draftW.Status = CategoryStatusDraft
	draft, err := repo.CreateCategory(ctx, draftW)
	require.NoError(t, err)
	require.Equal(t, CategoryStatusDraft, draft.Status)

	drafts, err := repo.ListCategoriesWithCounts(ctx, CategoryStatusDraft)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{draft.ID}, itCategoryIDs(drafts, live.ID, draft.ID))

	published, err := repo.ListCategoriesWithCounts(ctx, CategoryStatusPublished)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{live.ID}, itCategoryIDs(published, live.ID, draft.ID))

	all, err := repo.ListCategoriesWithCounts(ctx, "")
	require.NoError(t, err)
	require.Len(t, itCategoryIDs(all, live.ID, draft.ID), 2)

	// The full-row UPDATE carries the new status through.
	w := draftW
	w.Status = CategoryStatusArchived
	archived, err := repo.UpdateCategory(ctx, draft.ID, w, draft.UpdatedAt, false)
	require.NoError(t, err)
	require.Equal(t, CategoryStatusArchived, archived.Status)
}

// The CHECK constraint is the last line of defence behind the request
// validation: a value the API would have rejected cannot reach the table.
func TestIT_CategoryUnknownStatusIsRejectedByTheConstraint(t *testing.T) {
	repo, _ := taxonomyDB(t)
	w := itCat("cmsit-bad-" + uuid.NewString()[:8])
	w.Status = "retired"
	_, err := repo.CreateCategory(context.Background(), w)
	require.Error(t, err)
}

// itCategoryIDs keeps only the ids this test created — the developer's database
// has categories of its own and the list is not scoped to a prefix.
func itCategoryIDs(rows []categoryWithCount, mine ...uuid.UUID) []uuid.UUID {
	want := make(map[uuid.UUID]bool, len(mine))
	for _, id := range mine {
		want[id] = true
	}
	out := []uuid.UUID{}
	for _, c := range rows {
		if want[c.ID] {
			out = append(out, c.ID)
		}
	}
	return out
}
