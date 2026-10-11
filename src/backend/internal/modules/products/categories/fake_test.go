package categories

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/products/shared"
)

// fakeRepo is an in-memory category Repository for service unit tests.
type fakeRepo struct {
	rows map[uuid.UUID]*Category
	now  time.Time
	seq  int
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{rows: map[uuid.UUID]*Category{}, now: now}
}

func (r *fakeRepo) List(_ context.Context) ([]Category, error) {
	out := make([]Category, 0, len(r.rows))
	for _, c := range r.rows {
		out = append(out, *c)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (*Category, error) {
	c, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) Create(_ context.Context, w write) (*Category, error) {
	for _, c := range r.rows {
		if c.Slug == w.Slug {
			return nil, shared.ErrConflict
		}
	}
	order := r.seq
	if w.SortOrder != nil {
		order = *w.SortOrder
	}
	r.seq++
	c := &Category{
		ID: uuid.New(), Slug: w.Slug, Name: w.Name, Description: w.Description,
		SEOTitle: w.SEOTitle, SEODescription: w.SEODescription, SEOKeywords: w.SEOKeywords,
		SortOrder: order, CreatedAt: r.now, UpdatedAt: r.now,
	}
	r.rows[c.ID] = c
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) Update(_ context.Context, id uuid.UUID, w write) (*Category, error) {
	cur, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	for other, c := range r.rows {
		if other != id && c.Slug == w.Slug {
			return nil, shared.ErrConflict
		}
	}
	cur.Slug, cur.Name, cur.Description = w.Slug, w.Name, w.Description
	cur.SEOTitle, cur.SEODescription, cur.SEOKeywords = w.SEOTitle, w.SEODescription, w.SEOKeywords
	if w.SortOrder != nil {
		cur.SortOrder = *w.SortOrder
	}
	cur.UpdatedAt = r.now
	cp := *cur
	return &cp, nil
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	if _, ok := r.rows[id]; !ok {
		return shared.ErrNotFound
	}
	delete(r.rows, id)
	return nil
}

func (r *fakeRepo) SlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	for id, c := range r.rows {
		if excludeID != nil && id == *excludeID {
			continue
		}
		if c.Slug == slug {
			return true, nil
		}
	}
	return false, nil
}

func (r *fakeRepo) Reorder(_ context.Context, ids []uuid.UUID) error {
	for i, id := range ids {
		if c, ok := r.rows[id]; ok {
			c.SortOrder = i
		}
	}
	return nil
}
