package comments

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeRepo is an in-memory comment Repository for service unit tests.
type fakeRepo struct {
	comments map[uuid.UUID]*row
	now      time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{comments: map[uuid.UUID]*row{}, now: now}
}

func (r *fakeRepo) seedComment(articleID uuid.UUID, title, author, status string) *row {
	c := &row{ID: uuid.New(), ArticleID: articleID, ArticleTitle: title, AuthorName: author,
		Body: "hi", Status: status, CreatedAt: r.now}
	r.comments[c.ID] = c
	return c
}

func (r *fakeRepo) List(_ context.Context, p ListParams) ([]row, int, error) {
	matched := []row{}
	for _, c := range r.comments {
		if p.Status != "" && c.Status != p.Status {
			continue
		}
		if p.ArticleID != nil && c.ArticleID != *p.ArticleID {
			continue
		}
		matched = append(matched, *c)
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].ID.String() < matched[j].ID.String() })
	total := len(matched)
	start := (p.Page - 1) * p.PageSize
	if start > total {
		start = total
	}
	end := start + p.PageSize
	if end > total {
		end = total
	}
	return matched[start:end], total, nil
}

func (r *fakeRepo) GetRow(_ context.Context, id uuid.UUID) (*row, error) {
	c, ok := r.comments[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *c
	return &cp, nil
}

func (r *fakeRepo) UpdateStatus(_ context.Context, id uuid.UUID, status string) (*Comment, error) {
	c, ok := r.comments[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	c.Status = status
	if status == StatusApproved {
		t := r.now
		c.ApprovedAt = &t
	} else {
		c.ApprovedAt = nil
	}
	return &Comment{ID: c.ID, ArticleID: c.ArticleID, ParentID: c.ParentID, AuthorName: c.AuthorName,
		Status: c.Status, ApprovedAt: c.ApprovedAt, CreatedAt: c.CreatedAt}, nil
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	delete(r.comments, id)
	return nil
}

type tenv struct {
	svc  *Service
	repo *fakeRepo
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	base := shared.NewBase(&cmstest.FakeSettings{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, repo), repo: repo}
}
