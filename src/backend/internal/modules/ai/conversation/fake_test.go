package conversation

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/ai/endpoints"
	"github.com/velt/backend/internal/modules/ai/shared"
	"github.com/velt/backend/internal/modules/ai/tools"
)

// fakeRepo is an in-memory conversation store.
type fakeRepo struct {
	mu      sync.Mutex
	convs   map[uuid.UUID]*Conversation
	msgs    map[uuid.UUID][]Message
	members map[string]struct {
		id   uuid.UUID
		name string
	}
	usageIn  int
	usageOut int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		convs: map[uuid.UUID]*Conversation{},
		msgs:  map[uuid.UUID][]Message{},
		members: map[string]struct {
			id   uuid.UUID
			name string
		}{},
	}
}

func (r *fakeRepo) Create(_ context.Context, key string, ref *uuid.UUID) (*Conversation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := &Conversation{
		ID: uuid.New(), State: StateBot, VisitorKey: key, ReferrerMemberID: ref,
		LastActivityAt: time.Now(), CreatedAt: time.Now(),
	}
	r.convs[c.ID] = c
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (*Conversation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) CountTodayByVisitor(_ context.Context, key string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	today := time.Now().Truncate(24 * time.Hour)
	n := 0
	for _, c := range r.convs {
		if c.VisitorKey == key && !c.CreatedAt.Before(today) {
			n++
		}
	}
	return n, nil
}

// Mirrors the real query: newest activity first, closed threads excluded. The
// map has no order, so ties are broken on LastActivityAt the same way.
func (r *fakeRepo) ActiveByVisitor(_ context.Context, key string) (*Conversation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var best *Conversation
	for _, c := range r.convs {
		if c.VisitorKey != key || c.State == StateClosed {
			continue
		}
		if best == nil || c.LastActivityAt.After(best.LastActivityAt) {
			best = c
		}
	}
	if best == nil {
		return nil, shared.ErrNotFound
	}
	cp := *best
	return &cp, nil
}

func (r *fakeRepo) BumpTurn(_ context.Context, id uuid.UUID) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok {
		return 0, shared.ErrNotFound
	}
	c.TurnCount++
	return c.TurnCount, nil
}

func (r *fakeRepo) SetState(_ context.Context, id uuid.UUID, state string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok {
		return shared.ErrNotFound
	}
	c.State = state
	return nil
}

func (r *fakeRepo) AttachLead(_ context.Context, id, leadID uuid.UUID) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok {
		return false, shared.ErrNotFound
	}
	if c.LeadID != nil {
		return true, nil
	}
	c.LeadID = &leadID
	return false, nil
}

func (r *fakeRepo) AddMessage(_ context.Context, m Message) (*Message, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m.ID = uuid.New()
	m.CreatedAt = time.Now()
	r.msgs[m.ConversationID] = append(r.msgs[m.ConversationID], m)
	cp := m
	return &cp, nil
}

func (r *fakeRepo) History(_ context.Context, id uuid.UUID, limit int) ([]Message, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	all := r.msgs[id]
	if len(all) > limit {
		all = all[len(all)-limit:]
	}
	out := make([]Message, len(all))
	copy(out, all)
	return out, nil
}

func (r *fakeRepo) MemberBySlug(_ context.Context, slug string) (*uuid.UUID, string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	m, ok := r.members[slug]
	if !ok {
		return nil, "", shared.ErrNotFound
	}
	id := m.id
	return &id, m.name, nil
}

func (r *fakeRepo) Inbox(_ context.Context, state string, limit int) ([]InboxRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []InboxRow{}
	for _, c := range r.convs {
		if state != "" && c.State != state {
			continue
		}
		if state == "" && c.State == StateClosed {
			continue
		}
		row := InboxRow{Conversation: *c, MessageCount: len(r.msgs[c.ID])}
		if n := len(r.msgs[c.ID]); n > 0 {
			last := r.msgs[c.ID][n-1]
			row.LastMessage, row.LastRole = &last.Content, &last.Role
		}
		out = append(out, row)
	}
	return out, nil
}

func (r *fakeRepo) Claim(_ context.Context, id, userID uuid.UUID) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok {
		return false, shared.ErrNotFound
	}
	if c.State == StateClosed || c.ClaimedByUserID != nil {
		return false, nil
	}
	now := time.Now()
	c.State, c.ClaimedByUserID, c.ClaimedAt = StateHuman, &userID, &now
	return true, nil
}

func (r *fakeRepo) Release(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	c, ok := r.convs[id]
	if !ok || c.State != StateHuman {
		return shared.ErrNotFound
	}
	c.State, c.ClaimedByUserID, c.ClaimedAt = StateBot, nil, nil
	return nil
}

func (r *fakeRepo) AddUsage(_ context.Context, in, out int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.usageIn += in
	r.usageOut += out
	return nil
}

func (r *fakeRepo) UsageRange(_ context.Context, days int) ([]UsageDay, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return []UsageDay{{Day: "2026-10-11", Conversations: len(r.convs),
		TokensIn: int64(r.usageIn), TokensOut: int64(r.usageOut)}}, nil
}

func (r *fakeRepo) UsageToday(_ context.Context) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.usageOut, nil
}

// fakeSettings is a plain map of settings values.
type fakeSettings struct {
	bools   map[string]bool
	ints    map[string]int
	strings map[string]string
	secrets map[string]string
}

func newFakeSettings() *fakeSettings {
	return &fakeSettings{
		bools:   map[string]bool{shared.KeyEnabled: true},
		ints:    map[string]int{},
		strings: map[string]string{},
		secrets: map[string]string{},
	}
}

func (f *fakeSettings) GetBool(_ context.Context, k string) bool     { return f.bools[k] }
func (f *fakeSettings) GetInt(_ context.Context, k string) int       { return f.ints[k] }
func (f *fakeSettings) GetString(_ context.Context, k string) string { return f.strings[k] }
func (f *fakeSettings) GetSecret(_ context.Context, k string) string { return f.secrets[k] }

// fakeCatalog is an empty published catalog unless a test fills it.
type fakeCatalog struct {
	items []tools.CatalogItem
}

func (f *fakeCatalog) SearchPublished(_ context.Context, _ string, _ int) ([]tools.CatalogItem, error) {
	return f.items, nil
}

func (f *fakeCatalog) GetPublished(_ context.Context, slug string) (*tools.CatalogDetail, error) {
	for _, it := range f.items {
		if it.Slug == slug {
			return &tools.CatalogDetail{CatalogItem: it}, nil
		}
	}
	return nil, nil
}

type env struct {
	svc      *Service
	repo     *fakeRepo
	settings *fakeSettings
	catalog  *fakeCatalog
	hub      *Hub
	presence *Presence
	chain    *fakeChain
	notify   *fakeNotify
}

func newEnv(t *testing.T) *env {
	t.Helper()
	repo := newFakeRepo()
	set := newFakeSettings()
	chain := newFakeChain()
	cat := &fakeCatalog{}
	hub := NewHub()
	pres := NewPresence()
	reg := tools.NewRegistry()
	tools.RegisterCatalog(reg, cat, stubRoster{})
	notifier := &fakeNotify{}
	return &env{
		repo: repo, settings: set, catalog: cat, hub: hub, presence: pres, chain: chain,
		notify: notifier,
		svc: NewService(shared.NewBase(nil), repo, hub, pres, reg, cat, set,
			endpoints.NewServiceWithChain(chain), notifier),
	}
}

// fakeNotify records who would have been rung, without a push service.
type fakeNotify struct {
	recipient bool
	rung      []uuid.UUID
	online    []int
	// opened records ChatMessage calls separately from VisitorWaiting: the
	// two fire on different conditions and a test that conflated them would
	// pass while the wrong one rang.
	opened []uuid.UUID
}

func (f *fakeNotify) ChatMessage(_ context.Context, convID uuid.UUID) {
	f.opened = append(f.opened, convID)
}

func (f *fakeNotify) VisitorWaiting(_ context.Context, convID uuid.UUID, staffOnline int) {
	f.rung = append(f.rung, convID)
	f.online = append(f.online, staffOnline)
}

func (f *fakeNotify) HasRecipients(context.Context) bool { return f.recipient }

// fakeChain is the endpoint chain the tests run against: one link, with a key
// unless a test clears it. No network is reached — every test here exercises a
// path that stops before the model is called.
type fakeChain struct {
	kind, baseURL, apiKey, model string
	empty                        bool
}

func newFakeChain() *fakeChain {
	return &fakeChain{kind: "anthropic", apiKey: "test-key", model: "test-model"}
}

func (f *fakeChain) ResolveChain(context.Context, string) ([]endpoints.Resolved, [][]byte, error) {
	if f.empty {
		return nil, nil, nil
	}
	return []endpoints.Resolved{{
		ProviderID: uuid.New(), ProviderLabel: "test", Kind: f.kind,
		BaseURL: f.baseURL, APIKey: f.apiKey, Model: f.model,
	}}, [][]byte{nil}, nil
}

type stubRoster struct{}

func (stubRoster) ListActive(context.Context) ([]tools.Person, error) { return nil, nil }

// collect drains a subscription for a short while and returns what arrived.
func collect(ch <-chan Event, within time.Duration) []Event {
	var out []Event
	deadline := time.After(within)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return out
			}
			out = append(out, ev)
		case <-deadline:
			return out
		}
	}
}
