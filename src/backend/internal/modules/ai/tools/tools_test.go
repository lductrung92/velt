package tools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/stretchr/testify/require"
)

type stubCatalog struct {
	items  []CatalogItem
	detail *CatalogDetail
	lastQ  string
}

func (s *stubCatalog) SearchPublished(_ context.Context, q string, _ int) ([]CatalogItem, error) {
	s.lastQ = q
	return s.items, nil
}

func (s *stubCatalog) GetPublished(context.Context, string) (*CatalogDetail, error) {
	return s.detail, nil
}

type stubRoster struct{ people []Person }

func (s stubRoster) ListActive(context.Context) ([]Person, error) { return s.people, nil }

func newReg() (*Registry, *stubCatalog) {
	cat := &stubCatalog{}
	r := NewRegistry()
	RegisterCatalog(r, cat, stubRoster{})
	RegisterLead(r, &stubLead{})
	return r, cat
}

// stubLead records what the lead tool was asked to save.
type stubLead struct {
	got     []LeadInput
	already bool
	err     error
}

func (s *stubLead) Capture(_ context.Context, in LeadInput) (bool, error) {
	s.got = append(s.got, in)
	return s.already, s.err
}

func TestCallRefusesAToolOutsideTheAllowlist(t *testing.T) {
	// A model can name a tool it was never offered — hallucinated, or because a
	// visitor talked it into trying. The allowlist is enforced at call time,
	// not only when the spec list was built.
	r, _ := newReg()

	_, err := r.Call(context.Background(), []string{NameGetProduct},
		NameSearchProducts, json.RawMessage(`{"query":"x"}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "not available")

	_, err = r.Call(context.Background(), []string{NameGetProduct},
		NameGetProduct, json.RawMessage(`{"slug":"x"}`))
	require.NoError(t, err)
}

func TestCallRefusesAToolThatDoesNotExist(t *testing.T) {
	r, _ := newReg()
	_, err := r.Call(context.Background(), VisitorAllowlist,
		"delete_everything", json.RawMessage(`{}`))
	require.Error(t, err)
}

func TestVisitorAllowlistHasExactlyOneWrite(t *testing.T) {
	// The prompt-injection defence rests on this count. Whatever the assistant
	// is talked into, recording a contact request is the worst it can do — and
	// if a second write ever lands here, that guarantee is gone.
	r, _ := newReg()
	for _, name := range VisitorAllowlist {
		require.True(t, r.Has(name), "allowlist names an unregistered tool: %s", name)
	}
	writes := []string{}
	for _, tl := range r.Visible(VisitorAllowlist) {
		require.Empty(t, tl.Permission, "visitor tool %s needs a permission nobody can hold", tl.Name)
		if tl.Writes {
			writes = append(writes, tl.Name)
		}
	}
	require.Equal(t, []string{NameCreateLead}, writes)
}

func TestVisibleKeepsRegistrationOrderAndFilters(t *testing.T) {
	r, _ := newReg()
	got := r.Visible([]string{NameListMembers, NameSearchProducts})
	require.Len(t, got, 2)
	require.Equal(t, NameSearchProducts, got[0].Name, "registration order, not allowlist order")
	require.Equal(t, NameListMembers, got[1].Name)

	require.Empty(t, r.Visible(nil))
}

func TestSearchPassesTheTrimmedQuery(t *testing.T) {
	r, cat := newReg()
	cat.items = []CatalogItem{{Slug: "a", Name: "A"}}

	out, err := r.Call(context.Background(), VisitorAllowlist,
		NameSearchProducts, json.RawMessage(`{"query":"  quản kho  "}`))
	require.NoError(t, err)
	require.Equal(t, "quản kho", cat.lastQ)
	require.NotNil(t, out)
}

func TestMissingProductIsAnAnswerNotAnError(t *testing.T) {
	// The model should say "no such product", not retry around a failure.
	r, cat := newReg()
	cat.detail = nil

	out, err := r.Call(context.Background(), VisitorAllowlist,
		NameGetProduct, json.RawMessage(`{"slug":"khong-co"}`))
	require.NoError(t, err)
	require.Equal(t, map[string]any{"found": false}, out)
}

func TestCatalogShapeCarriesNoPriceField(t *testing.T) {
	// The assistant cannot discuss price because there is no price to put in
	// front of it. If this ever fails, the guarantee in docs §4 is gone.
	b, err := json.Marshal(CatalogDetail{CatalogItem: CatalogItem{Slug: "x", Name: "X"}})
	require.NoError(t, err)
	wire := string(b)
	for _, word := range []string{"price", "gia", "cost", "amount", "currency", "plan"} {
		require.NotContains(t, wire, word)
	}
}

func TestDuplicateToolIsAWiringBug(t *testing.T) {
	r, cat := newReg()
	require.Panics(t, func() { RegisterCatalog(r, cat, stubRoster{}) })
}

func TestLeadToolRefusesWithoutAContactChannel(t *testing.T) {
	// An answer, not an error: the model should go back and ask rather than
	// retry the same empty call.
	r, _ := newReg()
	lead := &stubLead{}
	r2 := NewRegistry()
	RegisterLead(r2, lead)
	ctx := WithLeadContext(context.Background(), LeadContext{ConversationID: uuid.New()})

	out, err := r2.Call(ctx, []string{NameCreateLead}, NameCreateLead,
		json.RawMessage(`{"name":"Khách","note":"quan tâm"}`))
	require.NoError(t, err)
	require.Equal(t, false, out.(map[string]any)["saved"])
	require.Empty(t, lead.got, "nothing may be written without a way to call back")
	_ = r
}

func TestLeadToolTakesOwnershipFromTheSessionNotTheModel(t *testing.T) {
	// The model supplies content. Which conversation this is, and who gets
	// credited, come from the session — otherwise a visitor could talk the
	// assistant into assigning their lead to someone else.
	lead := &stubLead{}
	r := NewRegistry()
	RegisterLead(r, lead)

	convID, memberID := uuid.New(), uuid.New()
	ctx := WithLeadContext(context.Background(), LeadContext{
		ConversationID: convID, ReferrerMemberID: &memberID,
	})

	// Note the hostile extra keys: the model is told to claim a different
	// conversation and a different owner.
	_, err := r.Call(ctx, []string{NameCreateLead}, NameCreateLead, json.RawMessage(
		`{"name":"Trần Bình","phone":"0900000000",
		  "conversation_id":"11111111-1111-1111-1111-111111111111",
		  "assigned_member_id":"22222222-2222-2222-2222-222222222222"}`))
	require.NoError(t, err)
	require.Len(t, lead.got, 1)
	require.Equal(t, convID, lead.got[0].ConversationID)
	require.Equal(t, &memberID, lead.got[0].ReferrerMemberID)
	require.Equal(t, "Trần Bình", lead.got[0].Name)
}

func TestLeadToolIsUnavailableWithoutASession(t *testing.T) {
	// Called from anywhere that is not a conversation, it must not write.
	lead := &stubLead{}
	r := NewRegistry()
	RegisterLead(r, lead)

	_, err := r.Call(context.Background(), []string{NameCreateLead}, NameCreateLead,
		json.RawMessage(`{"phone":"0900000000"}`))
	require.Error(t, err)
	require.Empty(t, lead.got)
}

func TestLeadToolReportsADuplicateInsteadOfInsisting(t *testing.T) {
	lead := &stubLead{already: true}
	r := NewRegistry()
	RegisterLead(r, lead)
	ctx := WithLeadContext(context.Background(), LeadContext{ConversationID: uuid.New()})

	out, err := r.Call(ctx, []string{NameCreateLead}, NameCreateLead,
		json.RawMessage(`{"phone":"0900000000"}`))
	require.NoError(t, err)
	m := out.(map[string]any)
	require.Equal(t, true, m["saved"])
	require.Contains(t, m["reason"], "trước đó")
}

func TestLeadToolTrimsWhitespaceOnlyContacts(t *testing.T) {
	lead := &stubLead{}
	r := NewRegistry()
	RegisterLead(r, lead)
	ctx := WithLeadContext(context.Background(), LeadContext{ConversationID: uuid.New()})

	out, err := r.Call(ctx, []string{NameCreateLead}, NameCreateLead,
		json.RawMessage(`{"phone":"   ","zalo":"","email":"  "}`))
	require.NoError(t, err)
	require.Equal(t, false, out.(map[string]any)["saved"])
	require.Empty(t, lead.got)
}
