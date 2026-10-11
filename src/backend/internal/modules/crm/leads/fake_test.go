package leads

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/crm/shared"
)

// fakeRepo is an in-memory stand-in. It reproduces the two rules the database
// enforces — reachability and FK validity — because the service is supposed to
// surface both as field errors rather than 500s.
type fakeRepo struct {
	rows     map[uuid.UUID]*Lead
	links    map[uuid.UUID][]uuid.UUID
	products map[uuid.UUID]ProductRef
	members  map[uuid.UUID]MemberRef
	calls    []string
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		rows:     map[uuid.UUID]*Lead{},
		links:    map[uuid.UUID][]uuid.UUID{},
		products: map[uuid.UUID]ProductRef{},
		members:  map[uuid.UUID]MemberRef{},
	}
}

func (r *fakeRepo) reachable(w write) bool {
	return w.Email != nil || w.Phone != nil || w.Zalo != nil
}

func (r *fakeRepo) link(leadID uuid.UUID, ids []uuid.UUID) error {
	seen := map[uuid.UUID]bool{}
	out := []uuid.UUID{}
	for _, id := range ids {
		if _, ok := r.products[id]; !ok {
			return shared.ErrLinkTargetMissing
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	r.links[leadID] = out
	return nil
}

func (r *fakeRepo) List(_ context.Context, p ListParams) ([]*Lead, int, error) {
	out := []*Lead{}
	for _, l := range r.rows {
		if p.Status != "" && l.Status != p.Status {
			continue
		}
		if p.Source != "" && l.Source != p.Source {
			continue
		}
		if p.Assignee == "unassigned" && l.AssignedMemberID != nil {
			continue
		}
		out = append(out, l)
	}
	return out, len(out), nil
}

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (*Lead, error) {
	l, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *l
	return &cp, nil
}

func (r *fakeRepo) Create(_ context.Context, w write, productIDs []uuid.UUID) (*Lead, error) {
	r.calls = append(r.calls, "create")
	if !r.reachable(w) {
		return nil, shared.ErrUnreachable
	}
	l := &Lead{
		ID: uuid.New(), Name: w.Name, Email: w.Email, Phone: w.Phone, Zalo: w.Zalo,
		Source: w.Source, ConversationID: w.ConversationID,
		AssignedMemberID: w.AssignedMemberID, Status: w.Status, Note: w.Note,
	}
	if err := r.link(l.ID, productIDs); err != nil {
		return nil, err
	}
	r.rows[l.ID] = l
	cp := *l
	return &cp, nil
}

func (r *fakeRepo) Update(_ context.Context, id uuid.UUID, w write,
	productIDs []uuid.UUID, setProducts bool,
) (*Lead, error) {
	cur, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if !r.reachable(w) {
		return nil, shared.ErrUnreachable
	}
	cur.Name, cur.Email, cur.Phone, cur.Zalo = w.Name, w.Email, w.Phone, w.Zalo
	cur.AssignedMemberID, cur.Status, cur.Note = w.AssignedMemberID, w.Status, w.Note
	if setProducts {
		if err := r.link(id, productIDs); err != nil {
			return nil, err
		}
	}
	cp := *cur
	return &cp, nil
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	if _, ok := r.rows[id]; !ok {
		return shared.ErrNotFound
	}
	delete(r.rows, id)
	delete(r.links, id)
	return nil
}

func (r *fakeRepo) ProductsOf(_ context.Context, leadID uuid.UUID) ([]ProductRef, error) {
	out := []ProductRef{}
	for _, id := range r.links[leadID] {
		out = append(out, r.products[id])
	}
	return out, nil
}

func (r *fakeRepo) AssigneeOf(_ context.Context, memberID uuid.UUID) (*MemberRef, error) {
	m, ok := r.members[memberID]
	if !ok {
		return nil, nil // deleted member: the FK already nulled the column
	}
	return &m, nil
}

// env wires a service over the fake repository.
type env struct {
	svc  *Service
	repo *fakeRepo
}

func newEnv(t *testing.T) *env {
	t.Helper()
	repo := newFakeRepo()
	return &env{repo: repo, svc: NewService(shared.NewBase(nil), repo)}
}

func (e *env) addProduct(name string) uuid.UUID {
	id := uuid.New()
	e.repo.products[id] = ProductRef{ID: id, Slug: name, Name: name}
	return id
}

func (e *env) addMember(name string) uuid.UUID {
	id := uuid.New()
	e.repo.members[id] = MemberRef{ID: id, Slug: name, FullName: name}
	return id
}

// identities
func manager() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(),
		Permissions: []string{permView, permViewAll, permManage}}
}

func viewer() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(),
		Permissions: []string{permView, permViewAll}}
}

func nobody() *httpx.Identity {
	return &httpx.Identity{UserID: uuid.New(), Permissions: []string{}}
}

func ptr(s string) *string { return &s }
