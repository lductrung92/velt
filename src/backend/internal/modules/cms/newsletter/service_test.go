package newsletter

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestNewsletter_ListRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListSubscribers(context.Background(), cmstest.ActorWith(), ListParams{})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestNewsletter_ListFilterByStatus(t *testing.T) {
	e := newTestSvc(t)
	e.repo.seedSubscriber("a@x.test", false)
	e.repo.seedSubscriber("b@x.test", false)
	e.repo.seedSubscriber("c@x.test", true) // unsubscribed
	act := cmstest.ActorWith(permNewsletterManage)

	all, err := e.svc.ListSubscribers(context.Background(), act, ListParams{})
	require.NoError(t, err)
	require.Equal(t, 3, all.Total)

	active, err := e.svc.ListSubscribers(context.Background(), act, ListParams{Status: StatusActive})
	require.NoError(t, err)
	require.Equal(t, 2, active.Total)

	unsub, err := e.svc.ListSubscribers(context.Background(), act, ListParams{Status: StatusUnsubscribed})
	require.NoError(t, err)
	require.Equal(t, 1, unsub.Total)
	require.Equal(t, "c@x.test", unsub.Items[0].Email)
}

func TestNewsletter_ListInvalidStatus(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListSubscribers(context.Background(), cmstest.ActorWith(permNewsletterManage), ListParams{Status: "bogus"})
	cmstest.AssertFieldErr(t, err, "status", "invalid_value")
}

func TestNewsletter_DeleteAndNotFound(t *testing.T) {
	e := newTestSvc(t)
	act := cmstest.ActorWith(permNewsletterManage)
	s := e.repo.seedSubscriber("a@x.test", false)
	require.NoError(t, e.svc.DeleteSubscriber(context.Background(), act, s.ID))
	_, ok := e.repo.subscribers[s.ID]
	require.False(t, ok)
	// already gone → 404
	err := e.svc.DeleteSubscriber(context.Background(), act, uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

func TestNewsletter_DeletePermissionDenied(t *testing.T) {
	e := newTestSvc(t)
	s := e.repo.seedSubscriber("a@x.test", false)
	err := e.svc.DeleteSubscriber(context.Background(), cmstest.ActorWith(), s.ID)
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}
