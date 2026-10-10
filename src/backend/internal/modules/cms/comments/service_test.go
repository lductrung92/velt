package comments

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

func TestComments_ListRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListComments(context.Background(), cmstest.ActorWith(), ListParams{})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestComments_ListFilterByStatusAndArticle(t *testing.T) {
	e := newTestSvc(t)
	a1, a2 := uuid.New(), uuid.New()
	e.repo.seedComment(a1, "A1", "Alice", StatusPending)
	e.repo.seedComment(a1, "A1", "Bob", StatusApproved)
	e.repo.seedComment(a2, "A2", "Carol", StatusPending)
	act := cmstest.ActorWith(permModerate)

	pending, err := e.svc.ListComments(context.Background(), act, ListParams{Status: StatusPending})
	require.NoError(t, err)
	require.Equal(t, 2, pending.Total)

	byArticle, err := e.svc.ListComments(context.Background(), act, ListParams{ArticleID: &a1})
	require.NoError(t, err)
	require.Equal(t, 2, byArticle.Total)
}

func TestComments_ListInvalidStatus(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.ListComments(context.Background(), cmstest.ActorWith(permModerate), ListParams{Status: "bogus"})
	cmstest.AssertFieldErr(t, err, "status", "invalid_value")
}

func TestComments_ApproveSetsApprovedAt(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusPending)
	res, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(permModerate), c.ID,
		UpdateRequest{Status: StatusApproved})
	require.NoError(t, err)
	require.Equal(t, StatusApproved, res.Status)
	require.NotNil(t, res.ApprovedAt)
}

func TestComments_RejectClearsApprovedAt(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusApproved)
	res, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(permModerate), c.ID,
		UpdateRequest{Status: StatusSpam})
	require.NoError(t, err)
	require.Equal(t, StatusSpam, res.Status)
	require.Nil(t, res.ApprovedAt)
}

func TestComments_UpdateNotFound(t *testing.T) {
	e := newTestSvc(t)
	_, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(permModerate), uuid.New(),
		UpdateRequest{Status: StatusApproved})
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}

// Moderation must not move a comment back to pending (service gate, not just the
// handler validator tag) — and the not-found check must not run first.
func TestComments_UpdateRejectsPending(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusApproved)
	_, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(permModerate), c.ID,
		UpdateRequest{Status: StatusPending})
	cmstest.AssertFieldErr(t, err, "status", "invalid_value")
}

func TestComments_UpdateRejectsUnknownStatus(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusPending)
	_, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(permModerate), c.ID,
		UpdateRequest{Status: "bogus"})
	cmstest.AssertFieldErr(t, err, "status", "invalid_value")
}

func TestComments_UpdateRequiresPermission(t *testing.T) {
	e := newTestSvc(t)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusPending)
	_, err := e.svc.UpdateComment(context.Background(), cmstest.ActorWith(), c.ID,
		UpdateRequest{Status: StatusApproved})
	cmstest.AssertAppErr(t, err, http.StatusForbidden, "access_denied")
}

func TestComments_DeleteAndNotFound(t *testing.T) {
	e := newTestSvc(t)
	act := cmstest.ActorWith(permModerate)
	c := e.repo.seedComment(uuid.New(), "A", "Alice", StatusPending)
	require.NoError(t, e.svc.DeleteComment(context.Background(), act, c.ID))
	_, ok := e.repo.comments[c.ID]
	require.False(t, ok)
	err := e.svc.DeleteComment(context.Background(), act, uuid.New())
	cmstest.AssertAppErr(t, err, http.StatusNotFound, "not_found")
}
