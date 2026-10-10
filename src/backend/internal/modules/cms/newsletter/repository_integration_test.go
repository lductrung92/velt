package newsletter

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestIT_NewsletterListFilterAndDelete(t *testing.T) {
	pool := cmstest.RequireDB(t)
	repo := NewRepository(pool)
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM cms_newsletter_subscribers WHERE email LIKE 'cmsit-%'`)
	})

	active := "cmsit-" + uuid.NewString()[:8] + "@x.test"
	unsub := "cmsit-" + uuid.NewString()[:8] + "@x.test"
	_, err := pool.Exec(ctx, `INSERT INTO cms_newsletter_subscribers (email) VALUES ($1)`, active)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO cms_newsletter_subscribers (email, unsubscribed_at) VALUES ($1, now())`, unsub)
	require.NoError(t, err)

	act, total, err := repo.ListSubscribers(ctx, ListParams{Status: StatusActive, Page: 1, PageSize: 50})
	require.NoError(t, err)
	require.GreaterOrEqual(t, total, 1)
	for _, s := range act {
		require.Nil(t, s.UnsubscribedAt)
	}

	// find + delete the active one
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM cms_newsletter_subscribers WHERE email = $1`, active).Scan(&id))
	got, err := repo.GetSubscriber(ctx, id)
	require.NoError(t, err)
	require.Equal(t, active, got.Email)
	require.NoError(t, repo.DeleteSubscriber(ctx, id))
	_, err = repo.GetSubscriber(ctx, id)
	require.ErrorIs(t, err, shared.ErrNotFound)
}
