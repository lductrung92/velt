package landing

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

// fakeRepo is an in-memory landing Repository for service unit tests.
type fakeRepo struct {
	landings map[uuid.UUID]*Page
	sections map[uuid.UUID]*Section
	now      time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{
		landings: map[uuid.UUID]*Page{},
		sections: map[uuid.UUID]*Section{},
		now:      now,
	}
}

func (r *fakeRepo) applyLandingWrite(p *Page, w landingWrite) {
	p.Key, p.Name, p.OGPath = w.Key, w.Name, w.OGPath
	p.SEOTitle, p.SEODescription, p.SEOKeywords = w.SEOTitle, w.SEODescription, w.SEOKeywords
	p.CanonicalURL, p.SEONoindex, p.SEONofollow = w.CanonicalURL, w.SEONoindex, w.SEONofollow
	p.OGTitle, p.OGDescription = w.OGTitle, w.OGDescription
}

func (r *fakeRepo) landingKeyTaken(key string, exclude uuid.UUID) bool {
	for _, p := range r.landings {
		if p.Key == key && p.ID != exclude {
			return true
		}
	}
	return false
}

func (r *fakeRepo) ListLandings(_ context.Context) ([]Page, error) {
	out := make([]Page, 0, len(r.landings))
	for _, p := range r.landings {
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (r *fakeRepo) GetLanding(_ context.Context, id uuid.UUID) (*Page, error) {
	p, ok := r.landings[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) CreateLanding(_ context.Context, w landingWrite) (*Page, error) {
	if r.landingKeyTaken(w.Key, uuid.Nil) {
		return nil, shared.ErrConflict
	}
	p := &Page{ID: uuid.New(), Status: LandingStatusDraft, CreatedAt: r.now, UpdatedAt: r.now}
	r.applyLandingWrite(p, w)
	r.landings[p.ID] = p
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) UpdateLanding(_ context.Context, id uuid.UUID, w landingWrite, expectedUpdatedAt time.Time) (*Page, error) {
	p, ok := r.landings[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if !p.UpdatedAt.Equal(expectedUpdatedAt) {
		return nil, shared.ErrOptLock
	}
	if r.landingKeyTaken(w.Key, id) {
		return nil, shared.ErrConflict
	}
	r.applyLandingWrite(p, w)
	p.UpdatedAt = r.now.Add(time.Second)
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) DeleteLanding(_ context.Context, id uuid.UUID) error {
	delete(r.landings, id)
	for sid, s := range r.sections {
		if s.LandingPageID == id {
			delete(r.sections, sid)
		}
	}
	return nil
}

func (r *fakeRepo) LandingSections(_ context.Context, landingID uuid.UUID) ([]Section, error) {
	out := []Section{}
	for _, s := range r.sections {
		if s.LandingPageID == landingID {
			out = append(out, *s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SortOrder < out[j].SortOrder })
	return out, nil
}

func (r *fakeRepo) GetSection(_ context.Context, sectionID uuid.UUID) (*Section, error) {
	s, ok := r.sections[sectionID]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *s
	return &cp, nil
}

func (r *fakeRepo) CreateSection(_ context.Context, landingID uuid.UUID, typ string, config []byte, isVisible bool) (*Section, error) {
	if _, ok := r.landings[landingID]; !ok {
		return nil, shared.ErrNotFound
	}
	next := 0
	for _, s := range r.sections {
		if s.LandingPageID == landingID && s.SortOrder >= next {
			next = s.SortOrder + 1
		}
	}
	s := &Section{ID: uuid.New(), LandingPageID: landingID, Type: typ,
		SortOrder: next, IsVisible: isVisible, Config: append([]byte(nil), config...)}
	r.sections[s.ID] = s
	cp := *s
	return &cp, nil
}

func (r *fakeRepo) UpdateSection(_ context.Context, sectionID uuid.UUID, config []byte, isVisible bool) (*Section, error) {
	s, ok := r.sections[sectionID]
	if !ok {
		return nil, shared.ErrNotFound
	}
	s.Config = append([]byte(nil), config...)
	s.IsVisible = isVisible
	cp := *s
	return &cp, nil
}

func (r *fakeRepo) DeleteSection(_ context.Context, sectionID uuid.UUID) error {
	delete(r.sections, sectionID)
	return nil
}

func (r *fakeRepo) ReorderSections(_ context.Context, landingID uuid.UUID, sectionIDs []uuid.UUID) error {
	// Mirror the real repo's per-row TOCTOU backstop: a section that is unknown
	// or belongs to another landing yields RowsAffected()==0 → ErrNotFound, which
	// rolls back the whole reorder. (No partial apply on the unknown-id path.)
	for _, sid := range sectionIDs {
		if s, ok := r.sections[sid]; !ok || s.LandingPageID != landingID {
			return shared.ErrNotFound
		}
	}
	for i, sid := range sectionIDs {
		r.sections[sid].SortOrder = i
	}
	return nil
}

func (r *fakeRepo) PublishedPageSlugsUsingLanding(_ context.Context, _ uuid.UUID) ([]string, error) {
	return nil, nil // no cms_pages in the landing unit fakes
}

func (r *fakeRepo) PublishLanding(_ context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	p, ok := r.landings[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if p.Status == LandingStatusPublished { // conditional: status <> 'published'
		return nil, shared.ErrInvalidStatus
	}
	p.Status = LandingStatusPublished
	p.PublishedSnapshot = append([]byte(nil), snapshot...)
	p.UpdatedAt = r.now.Add(time.Second)
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) SetLandingPublished(_ context.Context, id uuid.UUID, snapshot []byte) (*Page, error) {
	p, ok := r.landings[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	// Unconditional: refresh snapshot even if already published.
	p.Status = LandingStatusPublished
	p.PublishedSnapshot = append([]byte(nil), snapshot...)
	p.UpdatedAt = r.now.Add(time.Second)
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) UnpublishLanding(_ context.Context, id uuid.UUID) (*Page, error) {
	p, ok := r.landings[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if p.Status != LandingStatusPublished { // conditional: status = 'published'
		return nil, shared.ErrInvalidStatus
	}
	p.Status = LandingStatusDraft
	p.UpdatedAt = r.now.Add(time.Second)
	cp := *p
	return &cp, nil
}

type tenv struct {
	svc   *Service
	repo  *fakeRepo
	store *cmstest.FakeStore
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	clk := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo(clk)
	base := shared.NewBase(&cmstest.FakeSettings{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	st := cmstest.NewFakeStore()
	return &tenv{svc: NewService(base, repo, st), repo: repo, store: st}
}
