package pages

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
	"github.com/velt/backend/internal/modules/cms/widgets"
	"github.com/velt/backend/internal/platform/pubdocs"
)

// fakeRepo is an in-memory page Repository for service unit tests.
type fakeRepo struct {
	pages    map[uuid.UUID]*Page
	pageKeys map[string]uuid.UUID // (parentKey \x00 slug) → id; models UNIQUE(parent_id,slug)+root
	now      time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{pages: map[uuid.UUID]*Page{}, pageKeys: map[string]uuid.UUID{}, now: now}
}

func pageKey(parent *uuid.UUID, slug string) string {
	p := ""
	if parent != nil {
		p = parent.String()
	}
	return p + "\x00" + slug
}

func (r *fakeRepo) seedPage(title, slug string, parent *uuid.UUID, status string) *Page {
	p := &Page{ID: uuid.New(), Title: title, Slug: slug, ParentID: parent, Status: status, CreatedAt: r.now, UpdatedAt: r.now}
	r.pages[p.ID] = p
	r.pageKeys[pageKey(parent, slug)] = p.ID
	return p
}

func (r *fakeRepo) ListPages(_ context.Context) ([]Page, error) {
	out := make([]Page, 0, len(r.pages))
	for _, p := range r.pages {
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Title < out[j].Title
	})
	return out, nil
}

func (r *fakeRepo) GetPage(_ context.Context, id uuid.UUID) (*Page, error) {
	p, ok := r.pages[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) applyPageWrite(p *Page, w pageWrite) {
	p.Title, p.Slug, p.ParentID, p.SortOrder = w.Title, w.Slug, w.ParentID, w.SortOrder
	p.BodyHTML, p.BodyJSON, p.Template, p.OGPath = w.BodyHTML, w.BodyJSON, w.Template, w.OGPath
	p.SEOTitle, p.SEODescription, p.SEOKeywords = w.SEOTitle, w.SEODescription, w.SEOKeywords
	p.CanonicalURL, p.SEONoindex, p.SEONofollow = w.CanonicalURL, w.SEONoindex, w.SEONofollow
	p.OGTitle, p.OGDescription = w.OGTitle, w.OGDescription
	p.LandingID = w.LandingID
}

func (r *fakeRepo) CreatePage(_ context.Context, w pageWrite) (*Page, error) {
	if _, ok := r.pageKeys[pageKey(w.ParentID, w.Slug)]; ok {
		return nil, shared.ErrConflict
	}
	if w.ParentID != nil {
		if _, ok := r.pages[*w.ParentID]; !ok {
			return nil, shared.ErrParentMissing
		}
	}
	p := &Page{ID: uuid.New(), Status: PageStatusDraft, CreatedAt: r.now, UpdatedAt: r.now}
	r.applyPageWrite(p, w)
	r.pages[p.ID] = p
	r.pageKeys[pageKey(p.ParentID, p.Slug)] = p.ID
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) UpdatePage(_ context.Context, id uuid.UUID, w pageWrite, expectedUpdatedAt time.Time, recheckCycle bool) (*Page, error) {
	p, ok := r.pages[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if recheckCycle && w.ParentID != nil {
		for cur := w.ParentID; cur != nil; {
			if *cur == id {
				return nil, shared.ErrPageCycle
			}
			n, ok := r.pages[*cur]
			if !ok {
				break
			}
			cur = n.ParentID
		}
	}
	if !p.UpdatedAt.Equal(expectedUpdatedAt) {
		return nil, shared.ErrOptLock
	}
	if other, taken := r.pageKeys[pageKey(w.ParentID, w.Slug)]; taken && other != id {
		return nil, shared.ErrConflict
	}
	if w.ParentID != nil {
		if _, ok := r.pages[*w.ParentID]; !ok {
			return nil, shared.ErrParentMissing
		}
	}
	delete(r.pageKeys, pageKey(p.ParentID, p.Slug))
	r.applyPageWrite(p, w)
	p.UpdatedAt = r.now.Add(time.Second)
	r.pageKeys[pageKey(p.ParentID, p.Slug)] = id
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) DeletePage(_ context.Context, id uuid.UUID) error {
	for _, p := range r.pages {
		if p.ParentID != nil && *p.ParentID == id {
			return shared.ErrInUse
		}
	}
	if p, ok := r.pages[id]; ok {
		delete(r.pageKeys, pageKey(p.ParentID, p.Slug))
	}
	delete(r.pages, id)
	return nil
}

func (r *fakeRepo) PageHasChildren(_ context.Context, id uuid.UUID) (bool, error) {
	for _, p := range r.pages {
		if p.ParentID != nil && *p.ParentID == id {
			return true, nil
		}
	}
	return false, nil
}

func (r *fakeRepo) PageCreatesCycle(_ context.Context, node, newParent uuid.UUID) (bool, error) {
	cur := &newParent
	for cur != nil {
		if *cur == node {
			return true, nil
		}
		p, ok := r.pages[*cur]
		if !ok {
			break
		}
		cur = p.ParentID
	}
	return false, nil
}

func (r *fakeRepo) PageSlugExists(_ context.Context, slug string, parentID *uuid.UUID, excludeID *uuid.UUID) (bool, error) {
	id, ok := r.pageKeys[pageKey(parentID, slug)]
	return ok && (excludeID == nil || id != *excludeID), nil
}

func (r *fakeRepo) PublishPage(_ context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	p, ok := r.pages[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if p.Status == PageStatusPublished {
		return nil, shared.ErrInvalidStatus
	}
	p.Status = PageStatusPublished
	now := r.now
	p.PublishedAt = &now
	p.PublishedSnapshot = append([]byte(nil), snapshot...)
	p.UpdatedAt = r.now
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) RefreshPageSnapshot(_ context.Context, id uuid.UUID, snapshot []byte) error {
	p, ok := r.pages[id]
	if !ok || p.Status != PageStatusPublished {
		return nil
	}
	p.PublishedSnapshot = append([]byte(nil), snapshot...)
	p.UpdatedAt = r.now
	return nil
}

func (r *fakeRepo) UnpublishPage(_ context.Context, id uuid.UUID) (*Page, error) {
	p, ok := r.pages[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if p.Status != PageStatusPublished {
		return nil, shared.ErrInvalidStatus
	}
	p.Status = PageStatusArchived
	p.UpdatedAt = r.now
	cp := *p
	return &cp, nil
}

// fakeDocs is an in-memory published_docs. It is keyed by (entity, locale, slug)
// — the real table's primary key, which IS the URL — and it enforces the two
// constraints that key exists for: one record per URL, and one live URL per
// record and language. Those are exactly what the page publish path is now
// being tested against, so the fake has to honour them or the tests prove
// nothing.
type fakeDocs struct {
	rows map[string]*fakeDocRow // entity \x00 locale \x00 slug
}

type fakeDocRow struct {
	entityID  uuid.UUID
	isCurrent bool
	doc       pubdocs.Doc
}

func newFakeDocs() *fakeDocs { return &fakeDocs{rows: map[string]*fakeDocRow{}} }

func docKey(entity, locale, slug string) string { return entity + "\x00" + locale + "\x00" + slug }

// Publish mirrors the store: every doc is checked for a clash BEFORE anything is
// written, because the real one runs in a single transaction and a half-applied
// publish would hide the behaviour the caller leans on.
func (f *fakeDocs) Publish(_ context.Context, entity string, id uuid.UUID, docs []pubdocs.Doc) error {
	keep := map[string]bool{}
	for _, d := range docs {
		k := docKey(entity, d.Locale, d.Slug)
		if row, ok := f.rows[k]; ok && row.entityID != id {
			return pubdocs.ErrSlugTaken{Locale: d.Locale, Slug: d.Slug}
		}
		keep[k] = true
	}
	for k, row := range f.rows {
		if row.entityID == id && row.isCurrent && !keep[k] {
			row.isCurrent, row.doc.Body = false, nil // retired → answers 301
		}
	}
	for _, d := range docs {
		f.rows[docKey(entity, d.Locale, d.Slug)] = &fakeDocRow{entityID: id, isCurrent: true, doc: d}
	}
	return nil
}

func (f *fakeDocs) Unpublish(ctx context.Context, entity string, id uuid.UUID) error {
	return f.Publish(ctx, entity, id, nil)
}

func (f *fakeDocs) Purge(_ context.Context, entity string, id uuid.UUID) error {
	for k, row := range f.rows {
		if row.entityID == id && strings.HasPrefix(k, entity+"\x00") {
			delete(f.rows, k)
		}
	}
	return nil
}

func (f *fakeDocs) Get(_ context.Context, entity, locale, slug string) (*pubdocs.Found, error) {
	row, ok := f.rows[docKey(entity, locale, slug)]
	if !ok {
		return nil, pubdocs.ErrNotFound
	}
	found := &pubdocs.Found{
		Body: row.doc.Body, IsCurrent: row.isCurrent,
		EntityID: row.entityID, PublishedAt: row.doc.PublishedAt,
	}
	if row.isCurrent {
		return found, nil
	}
	for _, other := range f.rows {
		if other.entityID == row.entityID && other.isCurrent && other.doc.Locale == locale {
			found.CurrentSlug = other.doc.Slug
			return found, nil
		}
	}
	return nil, pubdocs.ErrNotFound
}

func (f *fakeDocs) Alternates(_ context.Context, entity string, id uuid.UUID) ([]pubdocs.Ref, error) {
	out := []pubdocs.Ref{}
	for k, row := range f.rows {
		if row.entityID == id && row.isCurrent && strings.HasPrefix(k, entity+"\x00") {
			out = append(out, pubdocs.Ref{Locale: row.doc.Locale, Slug: row.doc.Slug})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Locale < out[j].Locale })
	return out, nil
}

// fakeTranslator stands in for the translation module: a fixed language list and
// a fixed bundle of values.
type fakeTranslator struct {
	locales []string
	values  map[uuid.UUID]map[string]map[string]any
	purged  []uuid.UUID
	bundErr error
}

func (f *fakeTranslator) Locales(context.Context) []string { return f.locales }

func (f *fakeTranslator) Bundle(_ context.Context, _ string, _ []uuid.UUID, _ []string) (map[uuid.UUID]map[string]map[string]any, error) {
	if f.bundErr != nil {
		return nil, f.bundErr
	}
	return f.values, nil
}

func (f *fakeTranslator) Purge(_ context.Context, _ string, id uuid.UUID) error {
	f.purged = append(f.purged, id)
	return nil
}

// fakeLandingAdmin records the landing cascade calls the pages service makes.
type fakeLandingAdmin struct {
	created     []string // "name|key" per CreateDraft
	deleted     []uuid.UUID
	published   []uuid.UUID
	unpublished []uuid.UUID
	nextID      uuid.UUID
	createErr   error
	publishErr  error
}

func (f *fakeLandingAdmin) CreateDraft(_ context.Context, name, key string) (uuid.UUID, error) {
	if f.createErr != nil {
		return uuid.Nil, f.createErr
	}
	f.created = append(f.created, name+"|"+key)
	if f.nextID == uuid.Nil {
		f.nextID = uuid.New()
	}
	return f.nextID, nil
}

func (f *fakeLandingAdmin) Delete(_ context.Context, id uuid.UUID) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func (f *fakeLandingAdmin) Publish(_ context.Context, id uuid.UUID) error {
	if f.publishErr != nil {
		return f.publishErr
	}
	f.published = append(f.published, id)
	return nil
}

func (f *fakeLandingAdmin) Unpublish(_ context.Context, id uuid.UUID) error {
	f.unpublished = append(f.unpublished, id)
	return nil
}

type tenv struct {
	svc      *Service
	repo     *fakeRepo
	docs     *fakeDocs
	settings *cmstest.FakeSettings
	landing  *fakeLandingAdmin
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	fs := &cmstest.FakeSettings{}
	lp := &fakeLandingAdmin{}
	docs := newFakeDocs()
	base := shared.NewBase(fs, slog.New(slog.NewTextHandler(io.Discard, nil)))
	svc := NewService(base, repo, lp)
	// Wired by default: the read model is where a published page now lives, so a
	// test that publishes without it would be testing the pre-migration module.
	svc.SetPublicDocs(docs)
	return &tenv{svc: svc, repo: repo, docs: docs, settings: fs, landing: lp}
}

// publicSvc builds the public read over the same in-memory read model the
// service publishes into, so a test can follow one page from publish to page view.
func (e *tenv) publicSvc(landing LandingPort) *PublicService {
	return NewPublicService(NewPublicRepository(e.docs), widgets.NewResolver(widgets.Ports{}), landing)
}
