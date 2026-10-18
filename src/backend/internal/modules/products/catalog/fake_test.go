package catalog

import (
	"context"
	"encoding/json"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/products/shared"
)

// fakeRepo is an in-memory product Repository for service unit tests.
type fakeRepo struct {
	rows map[uuid.UUID]*Product
	now  time.Time
	seq  int
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{rows: map[uuid.UUID]*Product{}, now: now}
}

func (r *fakeRepo) List(_ context.Context, p ListParams) ([]Product, int, error) {
	var all []Product
	for _, prod := range r.rows {
		if p.Status != "" && prod.Status != p.Status {
			continue
		}
		if p.Lifecycle != "" && prod.Lifecycle != p.Lifecycle {
			continue
		}
		if p.Featured != nil && prod.IsFeatured != *p.Featured {
			continue
		}
		if p.Query != "" && !strings.Contains(strings.ToLower(prod.Name), strings.ToLower(p.Query)) {
			continue
		}
		if p.CreatedFrom != nil && prod.CreatedAt.Before(*p.CreatedFrom) {
			continue
		}
		if p.CreatedTo != nil && !prod.CreatedAt.Before(*p.CreatedTo) {
			continue
		}
		all = append(all, *prod)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].SortOrder != all[j].SortOrder {
			return all[i].SortOrder < all[j].SortOrder
		}
		return all[i].Name < all[j].Name
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

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (*Product, error) {
	p, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) GetBySlug(_ context.Context, slug string) (*Product, error) {
	for _, p := range r.rows {
		if p.Slug == slug {
			cp := *p
			return &cp, nil
		}
	}
	return nil, shared.ErrNotFound
}

func (r *fakeRepo) Create(_ context.Context, w write, createdBy *uuid.UUID) (*Product, error) {
	for _, p := range r.rows {
		if p.Slug == w.Slug {
			return nil, shared.ErrConflict
		}
	}
	order := r.seq
	if w.SortOrder != nil {
		order = *w.SortOrder
	}
	r.seq++
	p := &Product{
		ID: uuid.New(), Status: StatusDraft, CreatedBy: createdBy,
		CreatedAt: r.now, UpdatedAt: r.now, SortOrder: order,
	}
	applyWrite(p, w)
	p.SortOrder = order
	r.rows[p.ID] = p
	cp := *p
	return &cp, nil
}

func (r *fakeRepo) Update(_ context.Context, id uuid.UUID, w write) (*Product, error) {
	cur, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	for other, p := range r.rows {
		if other != id && p.Slug == w.Slug {
			return nil, shared.ErrConflict
		}
	}
	applyWrite(cur, w)
	if w.SortOrder != nil {
		cur.SortOrder = *w.SortOrder
	}
	cur.UpdatedAt = r.now
	cp := *cur
	return &cp, nil
}

// applyWrite mirrors the repository's full-row UPDATE: every writable column is
// replaced from the write, nothing is merged.
func applyWrite(p *Product, w write) {
	p.Slug, p.Name, p.Summary = w.Slug, w.Name, w.Summary
	p.BodyHTML, p.BodyJSON, p.CoverPath = w.BodyHTML, w.BodyJSON, w.CoverPath
	p.Lifecycle, p.Version, p.ReleasedAt = w.Lifecycle, w.Version, w.ReleasedAt
	p.Audience, p.Platforms = orEmpty(w.Audience), orEmpty(w.Platforms)
	p.TechStack, p.Highlights = orEmpty(w.TechStack), orEmpty(w.Highlights)
	p.IsFeatured = w.IsFeatured
	p.ProductURL, p.DemoURL, p.DemoAccess = w.ProductURL, w.DemoURL, w.DemoAccess
	p.DemoInstructions = orEmpty(w.DemoInstructions)
	p.SEO = w.SEO
}

func orEmpty(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	if _, ok := r.rows[id]; !ok {
		return shared.ErrNotFound
	}
	delete(r.rows, id)
	return nil
}

func (r *fakeRepo) SlugExists(_ context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	for id, p := range r.rows {
		if excludeID != nil && id == *excludeID {
			continue
		}
		if p.Slug == slug {
			return true, nil
		}
	}
	return false, nil
}

func (r *fakeRepo) SetStatus(_ context.Context, id uuid.UUID, status string, snapshot json.RawMessage, stamp bool) (*Product, error) {
	p, ok := r.rows[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	p.Status = status
	if snapshot != nil {
		p.PublishedSnapshot = snapshot
	}
	if stamp && p.PublishedAt == nil {
		t := r.now
		p.PublishedAt = &t
	}
	p.UpdatedAt = r.now
	cp := *p
	return &cp, nil
}

// fakeStore is an in-memory storage.Storage + storage.URLer for service tests.
type fakeStore struct {
	saved   map[string][]byte
	deleted []string
	purged  []string
}

func newFakeStore() *fakeStore { return &fakeStore{saved: map[string][]byte{}} }

func (s *fakeStore) Save(_ context.Context, key string, r io.Reader) error {
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
		return nil, shared.ErrNotFound
	}
	return io.NopCloser(strings.NewReader(string(b))), nil
}

func (s *fakeStore) URL(_ context.Context, key string) string { return "/api/files/" + key }

// DeleteTree makes the stub satisfy the optional recursive-delete capability
// the service uses to reclaim a deleted product's folder.
func (s *fakeStore) DeleteTree(_ context.Context, prefix string) error {
	s.purged = append(s.purged, prefix)
	for k := range s.saved {
		if strings.HasPrefix(k, prefix) {
			delete(s.saved, k)
		}
	}
	return nil
}

// fakeSettings returns a fixed upload cap.
type fakeSettings struct{ maxMB int }

func (f fakeSettings) GetInt(_ context.Context, key string) int {
	if key == "storage.max_upload_mb" {
		return f.maxMB
	}
	return 0
}

// fakeLinks is an in-memory LinksRepository for service unit tests.
type fakeLinks struct {
	cats    map[uuid.UUID][]CategoryRef
	members map[uuid.UUID][]MemberRef
	media   map[uuid.UUID][]MediaItem
	// known ids the fake will accept; anything else is an FK violation, which
	// is how the real table behaves.
	knownCats    map[uuid.UUID]CategoryRef
	knownMembers map[uuid.UUID]MemberRef
	now          time.Time
}

func newFakeLinks(now time.Time) *fakeLinks {
	return &fakeLinks{
		cats: map[uuid.UUID][]CategoryRef{}, members: map[uuid.UUID][]MemberRef{},
		media:     map[uuid.UUID][]MediaItem{},
		knownCats: map[uuid.UUID]CategoryRef{}, knownMembers: map[uuid.UUID]MemberRef{},
		now: now,
	}
}

func (f *fakeLinks) addCategory(name, slug string) CategoryRef {
	c := CategoryRef{ID: uuid.New(), Slug: slug, Name: name}
	f.knownCats[c.ID] = c
	return c
}

func (f *fakeLinks) addMember(name, slug string) MemberRef {
	m := MemberRef{ID: uuid.New(), Slug: slug, FullName: name}
	f.knownMembers[m.ID] = m
	return m
}

func (f *fakeLinks) Categories(_ context.Context, productID uuid.UUID) ([]CategoryRef, error) {
	out := append([]CategoryRef{}, f.cats[productID]...)
	return out, nil
}

func (f *fakeLinks) SetCategories(_ context.Context, productID uuid.UUID, ids []uuid.UUID) error {
	next := make([]CategoryRef, 0, len(ids))
	for _, id := range ids {
		c, ok := f.knownCats[id]
		if !ok {
			return shared.ErrLinkTargetMissing
		}
		next = append(next, c)
	}
	f.cats[productID] = next
	return nil
}

func (f *fakeLinks) Members(_ context.Context, productID uuid.UUID) ([]MemberRef, error) {
	out := append([]MemberRef{}, f.members[productID]...)
	return out, nil
}

func (f *fakeLinks) SetMembers(_ context.Context, productID uuid.UUID, links []MemberLinkInput) error {
	next := make([]MemberRef, 0, len(links))
	for i, l := range links {
		m, ok := f.knownMembers[l.MemberID]
		if !ok {
			return shared.ErrLinkTargetMissing
		}
		m.Role = l.Role
		m.SortOrder = i
		next = append(next, m)
	}
	f.members[productID] = next
	return nil
}

func (f *fakeLinks) Media(_ context.Context, productID uuid.UUID) ([]MediaItem, error) {
	out := append([]MediaItem{}, f.media[productID]...)
	sort.Slice(out, func(i, j int) bool { return out[i].SortOrder < out[j].SortOrder })
	return out, nil
}

func (f *fakeLinks) AddMedia(_ context.Context, productID uuid.UUID, kind string, path, videoURL, caption, device *string) (*MediaItem, error) {
	item := MediaItem{
		ID: uuid.New(), Kind: kind, path: path, VideoURL: videoURL, Caption: caption,
		Device:    device,
		SortOrder: len(f.media[productID]), CreatedAt: f.now,
	}
	f.media[productID] = append(f.media[productID], item)
	cp := item
	return &cp, nil
}

func (f *fakeLinks) UpdateMedia(_ context.Context, productID, mediaID uuid.UUID, caption, device *string, hero *bool) (*MediaItem, error) {
	for i, m := range f.media[productID] {
		if m.ID == mediaID {
			f.media[productID][i].Caption = caption
			f.media[productID][i].Device = device
			if hero != nil {
				f.media[productID][i].IsHero = *hero
			}
			cp := f.media[productID][i]
			return &cp, nil
		}
	}
	return nil, shared.ErrNotFound
}

func (f *fakeLinks) ClearHero(_ context.Context, productID, keepID uuid.UUID, device *string) error {
	same := func(a, b *string) bool {
		if a == nil || b == nil {
			return a == b
		}
		return *a == *b
	}
	for i, m := range f.media[productID] {
		if m.ID != keepID && same(m.Device, device) {
			f.media[productID][i].IsHero = false
		}
	}
	return nil
}

func (f *fakeLinks) DeleteMedia(_ context.Context, productID, mediaID uuid.UUID) (*MediaItem, error) {
	for i, m := range f.media[productID] {
		if m.ID == mediaID {
			f.media[productID] = append(f.media[productID][:i], f.media[productID][i+1:]...)
			cp := m
			return &cp, nil
		}
	}
	return nil, shared.ErrNotFound
}

func (f *fakeLinks) ReorderMedia(_ context.Context, productID uuid.UUID, ids []uuid.UUID) error {
	pos := make(map[uuid.UUID]int, len(ids))
	for i, id := range ids {
		pos[id] = i
	}
	for i, m := range f.media[productID] {
		if p, ok := pos[m.ID]; ok {
			f.media[productID][i].SortOrder = p
		}
	}
	return nil
}
