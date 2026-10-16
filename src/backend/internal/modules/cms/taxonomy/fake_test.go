package taxonomy

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeRepo is an in-memory taxonomy Repository for service unit tests.
type fakeRepo struct {
	cats        map[uuid.UUID]*Category
	catSlugs    map[string]uuid.UUID
	catArticles map[uuid.UUID]int
	tags        map[uuid.UUID]*Tag
	tagSlugs    map[string]uuid.UUID
	tagUsage    map[uuid.UUID]int
	now         time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{
		cats: map[uuid.UUID]*Category{}, catSlugs: map[string]uuid.UUID{}, catArticles: map[uuid.UUID]int{},
		tags: map[uuid.UUID]*Tag{}, tagSlugs: map[string]uuid.UUID{}, tagUsage: map[uuid.UUID]int{},
		now: now,
	}
}

func (r *fakeRepo) seedCategory(name, slug string, parent *uuid.UUID) *Category {
	c := &Category{ID: uuid.New(), Name: name, Slug: slug, ParentID: parent,
		Status: CategoryStatusPublished, CreatedAt: r.now, UpdatedAt: r.now}
	r.cats[c.ID] = c
	r.catSlugs[slug] = c.ID
	return c
}

func (r *fakeRepo) seedTag(name, slug string) *Tag {
	t := &Tag{ID: uuid.New(), Name: name, Slug: slug, CreatedAt: r.now}
	r.tags[t.ID] = t
	r.tagSlugs[slug] = t.ID
	return t
}

func (r *fakeRepo) ListCategoriesWithCounts(_ context.Context, status string) ([]categoryWithCount, error) {
	out := make([]categoryWithCount, 0, len(r.cats))
	for _, c := range r.cats {
		if status != "" && c.Status != status {
			continue
		}
		out = append(out, categoryWithCount{Category: *c, ArticleCount: r.catArticles[c.ID]})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

func (r *fakeRepo) GetCategory(_ context.Context, id uuid.UUID) (*Category, error) {
	c, ok := r.cats[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) CreateCategory(_ context.Context, w categoryWrite) (*Category, error) {
	if _, ok := r.catSlugs[w.Slug]; ok {
		return nil, shared.ErrConflict
	}
	c := &Category{
		ID: uuid.New(), Name: w.Name, Slug: w.Slug, ParentID: w.ParentID,
		Description: w.Description, SortOrder: w.SortOrder, Status: w.Status,
		SEOTitle: w.SEOTitle, SEODescription: w.SEODescription, SEOKeywords: w.SEOKeywords,
		CreatedAt: r.now, UpdatedAt: r.now,
	}
	r.cats[c.ID] = c
	r.catSlugs[c.Slug] = c.ID
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) UpdateCategory(_ context.Context, id uuid.UUID, w categoryWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Category, error) {
	c, ok := r.cats[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if !c.UpdatedAt.Equal(expectedUpdatedAt) {
		return nil, shared.ErrOptLock
	}
	if recheckCycle && w.ParentID != nil {
		for cur := w.ParentID; cur != nil; {
			if *cur == id {
				return nil, shared.ErrCategoryCycle
			}
			p, ok := r.cats[*cur]
			if !ok {
				break
			}
			cur = p.ParentID
		}
	}
	if other, taken := r.catSlugs[w.Slug]; taken && other != id {
		return nil, shared.ErrConflict
	}
	delete(r.catSlugs, c.Slug)
	c.Name, c.Slug, c.ParentID = w.Name, w.Slug, w.ParentID
	c.Description, c.SortOrder = w.Description, w.SortOrder
	c.Status = w.Status
	c.SEOTitle, c.SEODescription, c.SEOKeywords = w.SEOTitle, w.SEODescription, w.SEOKeywords
	c.UpdatedAt = r.now.Add(time.Second)
	r.catSlugs[c.Slug] = id
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) DeleteCategory(_ context.Context, id uuid.UUID) error {
	if c, ok := r.cats[id]; ok {
		delete(r.catSlugs, c.Slug)
	}
	delete(r.cats, id)
	delete(r.catArticles, id)
	return nil
}

func (r *fakeRepo) CategoryHasChildren(_ context.Context, id uuid.UUID) (bool, error) {
	for _, c := range r.cats {
		if c.ParentID != nil && *c.ParentID == id {
			return true, nil
		}
	}
	return false, nil
}

func (r *fakeRepo) CategoryArticleCount(_ context.Context, id uuid.UUID) (int, error) {
	return r.catArticles[id], nil
}

func (r *fakeRepo) CategoryCreatesCycle(_ context.Context, node, newParent uuid.UUID) (bool, error) {
	cur := &newParent
	for cur != nil {
		if *cur == node {
			return true, nil
		}
		c, ok := r.cats[*cur]
		if !ok {
			break
		}
		cur = c.ParentID
	}
	return false, nil
}

func (r *fakeRepo) CategorySlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	id, ok := r.catSlugs[slug]
	return ok && (excludeID == nil || id != *excludeID), nil
}

func (r *fakeRepo) TagSlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	id, ok := r.tagSlugs[slug]
	return ok && (excludeID == nil || id != *excludeID), nil
}

func (r *fakeRepo) ListTagsWithCounts(_ context.Context, p TagListParams) ([]tagWithCount, int, error) {
	all := make([]tagWithCount, 0, len(r.tags))
	q := strings.ToLower(p.Query)
	for _, t := range r.tags {
		if q != "" && !strings.Contains(strings.ToLower(t.Name), q) && !strings.Contains(strings.ToLower(t.Slug), q) {
			continue
		}
		all = append(all, tagWithCount{Tag: *t, UsageCount: r.tagUsage[t.ID]})
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Name < all[j].Name })
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

func (r *fakeRepo) ListTagOptions(_ context.Context) ([]Tag, error) {
	out := make([]Tag, 0, len(r.tags))
	for _, t := range r.tags {
		out = append(out, *t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (r *fakeRepo) GetTag(_ context.Context, id uuid.UUID) (*Tag, error) {
	t, ok := r.tags[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *t
	return &cp, nil
}

func (r *fakeRepo) TagExists(_ context.Context, id uuid.UUID) (bool, error) {
	_, ok := r.tags[id]
	return ok, nil
}

func (r *fakeRepo) TagUsageCount(_ context.Context, id uuid.UUID) (int, error) {
	return r.tagUsage[id], nil
}

func (r *fakeRepo) CreateTag(_ context.Context, name, slug string) (*Tag, error) {
	if _, ok := r.tagSlugs[slug]; ok {
		return nil, shared.ErrConflict
	}
	t := &Tag{ID: uuid.New(), Name: name, Slug: slug, CreatedAt: r.now}
	r.tags[t.ID] = t
	r.tagSlugs[slug] = t.ID
	cp := *t
	return &cp, nil
}

func (r *fakeRepo) UpdateTag(_ context.Context, id uuid.UUID, name, slug string) (*Tag, error) {
	t, ok := r.tags[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if other, taken := r.tagSlugs[slug]; taken && other != id {
		return nil, shared.ErrConflict
	}
	delete(r.tagSlugs, t.Slug)
	t.Name, t.Slug = name, slug
	r.tagSlugs[slug] = id
	cp := *t
	return &cp, nil
}

func (r *fakeRepo) DeleteTag(_ context.Context, id uuid.UUID) error {
	if t, ok := r.tags[id]; ok {
		delete(r.tagSlugs, t.Slug)
	}
	delete(r.tags, id)
	delete(r.tagUsage, id)
	return nil
}

func (r *fakeRepo) MergeTags(_ context.Context, sourceID, targetID uuid.UUID) error {
	r.tagUsage[targetID] += r.tagUsage[sourceID]
	if t, ok := r.tags[sourceID]; ok {
		delete(r.tagSlugs, t.Slug)
	}
	delete(r.tags, sourceID)
	delete(r.tagUsage, sourceID)
	return nil
}

type tenv struct {
	svc      *Service
	repo     *fakeRepo
	settings *cmstest.FakeSettings
	clk      time.Time
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	fs := &cmstest.FakeSettings{}
	base := shared.NewBase(fs, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, repo), repo: repo, settings: fs, clk: clk}
}
