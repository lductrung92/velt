package landing

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestIT_LandingCRUDSectionsAndPublish(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_landing_pages WHERE key LIKE 'cmsit-%'`) // sections cascade
	})

	key := "cmsit-" + uuid.NewString()[:8]
	l, err := repo.CreateLanding(ctx, landingWrite{Key: key, Name: "CMS IT Landing"})
	require.NoError(t, err)
	require.Equal(t, LandingStatusDraft, l.Status)

	_, err = repo.CreateLanding(ctx, landingWrite{Key: key, Name: "Dup"}) // key UNIQUE
	require.ErrorIs(t, err, shared.ErrConflict)

	// sections: append → sort_order 0,1
	s0, err := repo.CreateSection(ctx, l.ID, SectionHero, []byte(`{"a":1}`), true)
	require.NoError(t, err)
	require.Equal(t, 0, s0.SortOrder)
	s1, err := repo.CreateSection(ctx, l.ID, SectionFAQ, []byte(`{}`), false)
	require.NoError(t, err)
	require.Equal(t, 1, s1.SortOrder)

	// reorder → reverse
	require.NoError(t, repo.ReorderSections(ctx, l.ID, []uuid.UUID{s1.ID, s0.ID}))
	secs, err := repo.LandingSections(ctx, l.ID)
	require.NoError(t, err)
	require.Equal(t, s1.ID, secs[0].ID)

	// update section
	upd, err := repo.UpdateSection(ctx, s0.ID, []byte(`{"a":2}`), false)
	require.NoError(t, err)
	require.False(t, upd.IsVisible)

	// publish + unpublish
	pub, err := repo.PublishLanding(ctx, l.ID, []byte(`{"key":"x"}`))
	require.NoError(t, err)
	require.Equal(t, LandingStatusPublished, pub.Status)
	require.JSONEq(t, `{"key":"x"}`, string(pub.PublishedSnapshot))
	unp, err := repo.UnpublishLanding(ctx, l.ID)
	require.NoError(t, err)
	require.Equal(t, LandingStatusDraft, unp.Status)

	// delete section + delete landing (cascades remaining)
	require.NoError(t, repo.DeleteSection(ctx, s1.ID))
	require.NoError(t, repo.DeleteLanding(ctx, l.ID))
	_, err = repo.GetLanding(ctx, l.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
	_, err = repo.GetSection(ctx, s0.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}
