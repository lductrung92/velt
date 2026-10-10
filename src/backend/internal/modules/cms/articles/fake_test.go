package articles

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

// fakeRepo is an in-memory article Repository for service unit tests. Categories
// and tags are modelled as bare ID→ref maps (this feature only needs existence +
// the denormalised name/slug for responses).
type fakeRepo struct {
	articles map[uuid.UUID]*Article
	artSlugs map[string]uuid.UUID
	artTags  map[uuid.UUID][]uuid.UUID
	cats     map[uuid.UUID]ArticleCategoryRef
	tags     map[uuid.UUID]ArticleTagRef
	now      time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{
		articles: map[uuid.UUID]*Article{}, artSlugs: map[string]uuid.UUID{},
		artTags: map[uuid.UUID][]uuid.UUID{},
		cats:    map[uuid.UUID]ArticleCategoryRef{}, tags: map[uuid.UUID]ArticleTagRef{},
		now: now,
	}
}

func (r *fakeRepo) seedTag(name, slug string) ArticleTagRef {
	t := ArticleTagRef{ID: uuid.New(), Name: name, Slug: slug}
	r.tags[t.ID] = t
	return t
}

// seedArticle inserts an editor-authored article (author_role="editor") by default.
func (r *fakeRepo) seedArticle(title, slug string, author uuid.UUID, status string) *Article {
	a := &Article{ID: uuid.New(), Title: title, Slug: slug, AuthorID: author, AuthorRole: "editor", Status: status, CreatedAt: r.now, UpdatedAt: r.now}
	r.articles[a.ID] = a
	r.artSlugs[slug] = a.ID
	return a
}

func (r *fakeRepo) GetArticle(_ context.Context, id uuid.UUID) (*Article, error) {
	a, ok := r.articles[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *a
	return &cp, nil
}

func (r *fakeRepo) ArticleSlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	id, ok := r.artSlugs[slug]
	return ok && (excludeID == nil || id != *excludeID), nil
}

func (r *fakeRepo) CategoryExists(_ context.Context, id uuid.UUID) (bool, error) {
	_, ok := r.cats[id]
	return ok, nil
}

func (r *fakeRepo) ResolveArticleRefs(_ context.Context, authorID uuid.UUID, categoryID *uuid.UUID) (ArticleAuthor, *ArticleCategoryRef, error) {
	author := ArticleAuthor{ID: authorID}
	if categoryID == nil {
		return author, nil, nil
	}
	cat := ArticleCategoryRef{ID: *categoryID}
	if c, ok := r.cats[*categoryID]; ok {
		cat.Name, cat.Slug = c.Name, c.Slug
	}
	return author, &cat, nil
}

func (r *fakeRepo) ArticleTags(_ context.Context, id uuid.UUID) ([]ArticleTagRef, error) {
	out := []ArticleTagRef{}
	for _, tid := range r.artTags[id] {
		if t, ok := r.tags[tid]; ok {
			out = append(out, t)
		}
	}
	return out, nil
}

func (r *fakeRepo) CountTags(_ context.Context, ids []uuid.UUID) (int, error) {
	n := 0
	for _, id := range ids {
		if _, ok := r.tags[id]; ok {
			n++
		}
	}
	return n, nil
}

func (r *fakeRepo) applyArticleWrite(a *Article, w articleWrite) {
	a.Title, a.Slug, a.Excerpt, a.BodyHTML, a.BodyJSON = w.Title, w.Slug, w.Excerpt, w.BodyHTML, w.BodyJSON
	a.CategoryID, a.FeaturedPath, a.OGPath = w.CategoryID, w.FeaturedPath, w.OGPath
	a.SEOTitle, a.SEODescription, a.SEOKeywords = w.SEOTitle, w.SEODescription, w.SEOKeywords
	a.CanonicalURL, a.SEONoindex, a.SEONofollow = w.CanonicalURL, w.SEONoindex, w.SEONofollow
	a.OGTitle, a.OGDescription = w.OGTitle, w.OGDescription
}

func (r *fakeRepo) applyStatusWrite(a *Article, sw articleStatusWrite) {
	a.Status = sw.Status
	switch sw.Status {
	case ArticleStatusScheduled:
		a.PublishedAt = sw.PublishAt
		a.ReviewNote = nil
	case ArticleStatusPublished:
		now := r.now
		a.PublishedAt = &now
		a.PublishedSnapshot = append([]byte(nil), sw.Snapshot...)
		a.ReviewNote = nil
	case ArticleStatusNeedsRevision:
		a.ReviewNote = sw.ReviewNote
	default:
		a.ReviewNote = nil
	}
}

func (r *fakeRepo) CreateArticle(_ context.Context, w articleWrite, authorID uuid.UUID, authorRole string, sw articleStatusWrite, tagIDs []uuid.UUID) (*Article, error) {
	if _, ok := r.artSlugs[w.Slug]; ok {
		return nil, shared.ErrConflict
	}
	a := &Article{ID: uuid.New(), AuthorID: authorID, AuthorRole: authorRole, CreatedAt: r.now, UpdatedAt: r.now}
	r.applyArticleWrite(a, w)
	r.applyStatusWrite(a, sw)
	r.articles[a.ID] = a
	r.artSlugs[a.Slug] = a.ID
	r.artTags[a.ID] = append([]uuid.UUID(nil), tagIDs...)
	cp := *a
	return &cp, nil
}

func (r *fakeRepo) UpdateArticle(_ context.Context, id uuid.UUID, w articleWrite, sw articleStatusWrite, expectedUpdatedAt time.Time, tagIDs *[]uuid.UUID) (*Article, error) {
	a, ok := r.articles[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if !a.UpdatedAt.Equal(expectedUpdatedAt) {
		return nil, shared.ErrOptLock
	}
	if other, taken := r.artSlugs[w.Slug]; taken && other != id {
		return nil, shared.ErrConflict
	}
	delete(r.artSlugs, a.Slug)
	r.applyArticleWrite(a, w)
	r.applyStatusWrite(a, sw)
	a.UpdatedAt = r.now.Add(time.Second)
	r.artSlugs[a.Slug] = id
	if tagIDs != nil {
		r.artTags[id] = append([]uuid.UUID(nil), *tagIDs...)
	}
	cp := *a
	return &cp, nil
}

func (r *fakeRepo) DeleteArticle(_ context.Context, id uuid.UUID) error {
	if a, ok := r.articles[id]; ok {
		delete(r.artSlugs, a.Slug)
	}
	delete(r.articles, id)
	delete(r.artTags, id)
	return nil
}

func (r *fakeRepo) ListArticles(_ context.Context, p ArticleListParams) ([]articleListRow, int, error) {
	matched := []*Article{}
	for _, a := range r.articles {
		if p.Status != "" && a.Status != p.Status {
			continue
		}
		if p.AuthorID != nil && a.AuthorID != *p.AuthorID {
			continue
		}
		if p.CategoryID != nil && (a.CategoryID == nil || *a.CategoryID != *p.CategoryID) {
			continue
		}
		if p.Query != "" && !strings.Contains(strings.ToLower(a.Title), strings.ToLower(p.Query)) {
			continue
		}
		matched = append(matched, a)
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].Title < matched[j].Title })
	total := len(matched)
	start := (p.Page - 1) * p.PageSize
	if start > total {
		start = total
	}
	end := start + p.PageSize
	if end > total {
		end = total
	}
	out := []articleListRow{}
	for _, a := range matched[start:end] {
		out = append(out, articleListRow{ID: a.ID, Title: a.Title, Slug: a.Slug, Status: a.Status,
			CategoryID: a.CategoryID, AuthorID: a.AuthorID, PublishedAt: a.PublishedAt, UpdatedAt: a.UpdatedAt})
	}
	return out, total, nil
}

type tenv struct {
	svc      *Service
	repo     *fakeRepo
	settings *cmstest.FakeSettings
	store    *cmstest.FakeStore
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	fs := &cmstest.FakeSettings{}
	store := cmstest.NewFakeStore()
	base := shared.NewBase(fs, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, repo, store), repo: repo, settings: fs, store: store}
}

// flags sets the cms.* boolean flags for a test.
func (e *tenv) flags(kv map[string]bool) {
	g := make([]map[string]any, 0, len(kv))
	for k, v := range kv {
		g = append(g, map[string]any{"key": k, "type": "bool", "value": v})
	}
	e.settings.Group = g
}
