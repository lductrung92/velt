package leads

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/velt/backend/internal/apperr"
)

func ctx() context.Context { return context.Background() }

func TestCreateRequiresAContactChannel(t *testing.T) {
	// The whole point of a lead is that someone can be called back. A row with
	// a name and nothing else is a visit, not a lead.
	e := newEnv(t)

	_, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Name: ptr("Khách lạ")},
	})
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 422, ae.Status)
	require.Empty(t, e.repo.calls, "must be rejected before reaching the database")

	for _, ok := range []CreateRequest{
		{Contact: Contact{Email: ptr("a@b.com")}},
		{Contact: Contact{Phone: ptr("0900000000")}},
		{Contact: Contact{Zalo: ptr("https://zalo.me/x")}},
	} {
		_, err := e.svc.Create(ctx(), manager(), ok)
		require.NoError(t, err)
	}
}

func TestWhitespaceOnlyContactIsNotAContact(t *testing.T) {
	// "   " survives a required check but cannot be dialled.
	e := newEnv(t)
	_, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Phone: ptr("   "), Name: ptr("A")},
	})
	require.Error(t, err)
}

func TestEmailFormatCheckedInServiceNotByTag(t *testing.T) {
	// go-playground validates the POINTER, so `omitempty,email` would still
	// fire on a non-nil pointer to "" — the console's "clear this field"
	// sentinel. Format lives here instead; see .wolf/cerebrum.md.
	e := newEnv(t)

	_, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("khong-phai-email")},
	})
	require.Error(t, err)

	// Clearing the email on a lead that is still reachable by phone must work.
	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com"), Phone: ptr("0900000000")},
	})
	require.NoError(t, err)

	updated, err := e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{
		Contact: Contact{Email: ptr("")},
	})
	require.NoError(t, err)
	require.Nil(t, updated.Email)
	require.NotNil(t, updated.Phone)
}

func TestUpdateCannotStripTheLastContactChannel(t *testing.T) {
	e := newEnv(t)
	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")},
	})
	require.NoError(t, err)

	_, err = e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{
		Contact: Contact{Email: ptr("")},
	})
	require.Error(t, err, "clearing the only channel must be refused")
}

func TestPatchKeepsOmittedFields(t *testing.T) {
	e := newEnv(t)
	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Name: ptr("An"), Email: ptr("a@b.com")},
		Note:    ptr("ghi chú gốc"),
	})
	require.NoError(t, err)

	got, err := e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{
		Status: ptr(StatusContacted),
	})
	require.NoError(t, err)
	require.Equal(t, StatusContacted, got.Status)
	require.Equal(t, "An", *got.Name)
	require.Equal(t, "ghi chú gốc", *got.Note, "an omitted field must be left alone")
}

func TestAssignmentHasThreeOutcomes(t *testing.T) {
	// Absent, set, and cleared — but JSON only offers absent and null, which is
	// why ClearAssignee exists.
	e := newEnv(t)
	m1, m2 := e.addMember("an-nguyen"), e.addMember("binh-tran")

	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, AssignedMemberID: &m1,
	})
	require.NoError(t, err)
	require.Equal(t, "an-nguyen", created.Assignee.Slug)

	// Absent → keep.
	got, err := e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{Note: ptr("x")})
	require.NoError(t, err)
	require.Equal(t, "an-nguyen", got.Assignee.Slug)

	// Set → reassign.
	got, err = e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{AssignedMemberID: &m2})
	require.NoError(t, err)
	require.Equal(t, "binh-tran", got.Assignee.Slug)

	// Cleared → back to the shared queue.
	got, err = e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{ClearAssignee: true})
	require.NoError(t, err)
	require.Nil(t, got.Assignee)
}

func TestDeletedMemberLeavesTheLeadStanding(t *testing.T) {
	// A member leaving must never take customer records with them.
	e := newEnv(t)
	m := e.addMember("an-nguyen")
	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, AssignedMemberID: &m,
	})
	require.NoError(t, err)

	delete(e.repo.members, m)
	got, err := e.svc.Get(ctx(), manager(), created.ID)
	require.NoError(t, err)
	require.Nil(t, got.Assignee)
}

func TestInvalidStatusAndSourceRejected(t *testing.T) {
	e := newEnv(t)
	_, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, Status: ptr("đang-nghĩ"),
	})
	require.Error(t, err)

	_, err = e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, Source: ptr("telepathy"),
	})
	require.Error(t, err)
}

func TestUnknownProductIsAFieldErrorNotAFault(t *testing.T) {
	e := newEnv(t)
	_, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, ProductIDs: []uuid.UUID{uuid.New()},
	})
	require.Error(t, err)
	var ae *apperr.AppError
	require.ErrorAs(t, err, &ae)
	require.Equal(t, 422, ae.Status, "a client-supplied id must not become a 500")
}

func TestProductsDeduplicateAndOmittedListIsKept(t *testing.T) {
	e := newEnv(t)
	p1 := e.addProduct("bang-cong-viec")

	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")}, ProductIDs: []uuid.UUID{p1, p1},
	})
	require.NoError(t, err)
	require.Len(t, created.Products, 1, "asking twice is asking once")

	got, err := e.svc.Update(ctx(), manager(), created.ID, UpdateRequest{Status: ptr(StatusWon)})
	require.NoError(t, err)
	require.Len(t, got.Products, 1, "a PATCH without product_ids must not clear them")

	got, err = e.svc.Update(ctx(), manager(), created.ID,
		UpdateRequest{ProductIDs: []uuid.UUID{}})
	require.NoError(t, err)
	require.Empty(t, got.Products, "an explicit empty list does clear them")
}

func TestPermissionGate(t *testing.T) {
	e := newEnv(t)
	created, err := e.svc.Create(ctx(), manager(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")},
	})
	require.NoError(t, err)

	_, err = e.svc.Create(ctx(), viewer(), CreateRequest{Contact: Contact{Email: ptr("c@d.com")}})
	require.Error(t, err, "viewing does not imply writing")

	_, err = e.svc.Update(ctx(), viewer(), created.ID, UpdateRequest{Status: ptr(StatusLost)})
	require.Error(t, err)

	require.Error(t, e.svc.Delete(ctx(), viewer(), created.ID))

	_, err = e.svc.Get(ctx(), nobody(), created.ID)
	require.Error(t, err)

	_, err = e.svc.List(ctx(), nobody(), ListParams{})
	require.Error(t, err)
}

func TestCaptureFromChatNeedsNoIdentityButStillNeedsAContact(t *testing.T) {
	// The assistant acts for an anonymous visitor, so this path has no identity
	// to gate on. It is the ONLY unauthenticated write, and it must still
	// refuse a lead nobody can call back.
	e := newEnv(t)
	member := e.addMember("an-nguyen")
	conv := uuid.New()

	_, err := e.svc.CaptureFromChat(ctx(), CreateRequest{Contact: Contact{Name: ptr("Khách")}})
	require.Error(t, err)

	got, err := e.svc.CaptureFromChat(ctx(), CreateRequest{
		Contact:          Contact{Name: ptr("Khách"), Zalo: ptr("https://zalo.me/x")},
		ConversationID:   &conv,
		AssignedMemberID: &member,
	})
	require.NoError(t, err)
	require.Equal(t, SourceChat, got.Source, "source is forced, not taken from the caller")
	require.Equal(t, StatusNew, got.Status)
	require.Equal(t, conv, *got.ConversationID)
	require.Equal(t, "an-nguyen", got.Assignee.Slug, "the ?ref= member gets the lead")
}

func TestCaptureFromChatCannotForgeItsSource(t *testing.T) {
	// Source says where a lead came from; the assistant must not be able to
	// pass a lead off as having been entered by a person.
	e := newEnv(t)
	got, err := e.svc.CaptureFromChat(ctx(), CreateRequest{
		Contact: Contact{Email: ptr("a@b.com")},
		Source:  ptr(SourceManual),
		Status:  ptr(StatusWon),
	})
	require.NoError(t, err)
	require.Equal(t, SourceChat, got.Source)
	require.Equal(t, StatusNew, got.Status)
}

func TestListNormalizesPaging(t *testing.T) {
	e := newEnv(t)
	got, err := e.svc.List(ctx(), manager(), ListParams{Page: 0, PageSize: 0})
	require.NoError(t, err)
	require.Equal(t, 1, got.Page)
	require.Equal(t, defaultPageSize, got.PageSize)

	got, err = e.svc.List(ctx(), manager(), ListParams{Page: -3, PageSize: 10000})
	require.NoError(t, err)
	require.Equal(t, 1, got.Page)
	require.Equal(t, maxPageSize, got.PageSize)
}
