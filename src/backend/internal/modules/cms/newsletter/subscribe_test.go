package newsletter

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSubscribe_NewEmail(t *testing.T) {
	env := newTestSvc(t)
	err := env.svc.Subscribe(context.Background(), SubscribeRequest{Email: "a@b.com", Source: "landing"}, "1.2.3.4")
	require.NoError(t, err)

	list, total, err := env.repo.ListSubscribers(context.Background(), ListParams{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, "a@b.com", list[0].Email)
	require.NotNil(t, list[0].SourceKey)
	require.Equal(t, "landing", *list[0].SourceKey)
}

func TestSubscribe_Idempotent_ReactivatesUnsubscribed(t *testing.T) {
	env := newTestSvc(t)
	env.repo.seedSubscriber("a@b.com", true) // previously unsubscribed

	err := env.svc.Subscribe(context.Background(), SubscribeRequest{Email: "a@b.com"}, "")
	require.NoError(t, err)

	// Still one row, and it is active again (no duplicate, no leak of prior state).
	_, total, err := env.repo.ListSubscribers(context.Background(), ListParams{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	active, _, err := env.repo.ListSubscribers(context.Background(), ListParams{Status: StatusActive, Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.Len(t, active, 1)
}

func TestSubscribe_EmptyEmail(t *testing.T) {
	env := newTestSvc(t)
	err := env.svc.Subscribe(context.Background(), SubscribeRequest{Email: "   "}, "1.2.3.4")
	require.Error(t, err)
}
