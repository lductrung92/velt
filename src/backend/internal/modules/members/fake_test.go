package members

import (
	"context"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory members Repository for service unit tests.
type fakeRepo struct {
	rows map[uuid.UUID]*Member
	now  time.Time
	seq  int
	// failOn forces the named operation to return err (error-path coverage).
	failOn string
	err    error
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{rows: map[uuid.UUID]*Member{}, now: now}
}

func (r *fakeRepo) fail(op string) error {
	if r.failOn == op {
		return r.err
	}
	return nil
}

func (r *fakeRepo) List(_ context.Context, p ListParams) ([]Member, int, error) {
	if err := r.fail("list"); err != nil {
		return nil, 0, err
	}
	var all []Member
	for _, m := range r.rows {
		if p.ActiveOnly && !m.IsActive {
			continue
		}
		if p.Query != "" && !strings.Contains(strings.ToLower(m.FullName), strings.ToLower(p.Query)) {
			continue
		}
		all = append(all, *m)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].SortOrder != all[j].SortOrder {
			return all[i].SortOrder < all[j].SortOrder
		}
		return all[i].FullName < all[j].FullName
	})
	total := len(all)
	start := (p.Page - 1) * p.PageSize
	if start > total {
		start = total
	}
	end := start + p.PageSize
	if end > total {
		end = total
	}
	return all[start:end], total, nil
}

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (*Member, error) {
	if err := r.fail("get"); err != nil {
		return nil, err
	}
	m, ok := r.rows[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *m
	return &cp, nil
}

func (r *fakeRepo) GetBySlug(_ context.Context, slug string) (*Member, error) {
	for _, m := range r.rows {
		if m.Slug == slug {
			cp := *m
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (r *fakeRepo) Create(_ context.Context, w write) (*Member, error) {
	if err := r.fail("create"); err != nil {
		return nil, err
	}
	for _, m := range r.rows {
		if m.Slug == w.Slug {
			return nil, ErrConflict
		}
	}
	order := r.seq
	if w.SortOrder != nil {
		order = *w.SortOrder
	}
	r.seq++
	m := &Member{
		ID: uuid.New(), Slug: w.Slug, FullName: w.FullName, Role: w.Role, Bio: w.Bio,
		Email: w.Email, Zalo: w.Zalo, Links: w.Links, Skills: w.Skills,
		SortOrder: order, IsActive: w.IsActive, CreatedAt: r.now, UpdatedAt: r.now,
	}
	if m.Links == nil {
		m.Links = []Link{}
	}
	if m.Skills == nil {
		m.Skills = []string{}
	}
	r.rows[m.ID] = m
	cp := *m
	return &cp, nil
}

func (r *fakeRepo) Update(_ context.Context, id uuid.UUID, w write) (*Member, error) {
	if err := r.fail("update"); err != nil {
		return nil, err
	}
	cur, ok := r.rows[id]
	if !ok {
		return nil, ErrNotFound
	}
	for other, m := range r.rows {
		if other != id && m.Slug == w.Slug {
			return nil, ErrConflict
		}
	}
	cur.Slug, cur.FullName = w.Slug, w.FullName
	cur.Role, cur.Bio, cur.Email, cur.Zalo = w.Role, w.Bio, w.Email, w.Zalo
	cur.Links, cur.Skills, cur.IsActive = w.Links, w.Skills, w.IsActive
	if w.SortOrder != nil {
		cur.SortOrder = *w.SortOrder
	}
	cur.UpdatedAt = r.now
	cp := *cur
	return &cp, nil
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	if _, ok := r.rows[id]; !ok {
		return ErrNotFound
	}
	delete(r.rows, id)
	return nil
}

func (r *fakeRepo) SlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	for id, m := range r.rows {
		if excludeID != nil && id == *excludeID {
			continue
		}
		if m.Slug == slug {
			return true, nil
		}
	}
	return false, nil
}

func (r *fakeRepo) UpdateAvatarPath(_ context.Context, id uuid.UUID, path *string) error {
	m, ok := r.rows[id]
	if !ok {
		return ErrNotFound
	}
	m.AvatarPath = path
	return nil
}

func (r *fakeRepo) Reorder(_ context.Context, ids []uuid.UUID) error {
	for i, id := range ids {
		if m, ok := r.rows[id]; ok {
			m.SortOrder = i
		}
	}
	return nil
}

// fakeStore is an in-memory storage.Storage + storage.URLer for service tests.
type fakeStore struct {
	saved   map[string][]byte
	deleted []string
	saveErr error
}

func newFakeStore() *fakeStore {
	return &fakeStore{saved: map[string][]byte{}}
}

func (s *fakeStore) Save(_ context.Context, key string, r io.Reader) error {
	if s.saveErr != nil {
		return s.saveErr
	}
	b, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	s.saved[key] = b
	return nil
}

func (s *fakeStore) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	delete(s.saved, key)
	return nil
}

func (s *fakeStore) Open(_ context.Context, key string) (io.ReadCloser, error) {
	b, ok := s.saved[key]
	if !ok {
		return nil, ErrNotFound
	}
	return io.NopCloser(strings.NewReader(string(b))), nil
}

func (s *fakeStore) URL(_ context.Context, key string) string { return "/api/files/" + key }

// fakeSettings returns a fixed upload cap.
type fakeSettings struct{ maxMB int }

func (f fakeSettings) GetInt(_ context.Context, key string) int {
	if key == "storage.max_upload_mb" {
		return f.maxMB
	}
	return 0
}
