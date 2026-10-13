package menus

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

// fakeRepo is an in-memory menu Repository for service unit tests.
type fakeRepo struct {
	menus     map[uuid.UUID]*Menu
	menuItems map[uuid.UUID][]itemRow
	now       time.Time
}

func newFakeRepo(now time.Time) *fakeRepo {
	return &fakeRepo{menus: map[uuid.UUID]*Menu{}, menuItems: map[uuid.UUID][]itemRow{}, now: now}
}

func (r *fakeRepo) ListMenus(_ context.Context) ([]Menu, error) {
	out := make([]Menu, 0, len(r.menus))
	for _, m := range r.menus {
		out = append(out, *m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Location < out[j].Location })
	return out, nil
}

func (r *fakeRepo) GetMenu(_ context.Context, id uuid.UUID) (*Menu, error) {
	m, ok := r.menus[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	cp := *m
	return &cp, nil
}

func (r *fakeRepo) locationTaken(location string, exclude uuid.UUID) bool {
	for _, m := range r.menus {
		if m.Location == location && m.ID != exclude {
			return true
		}
	}
	return false
}

func (r *fakeRepo) CreateMenu(_ context.Context, name, location string) (*Menu, error) {
	if r.locationTaken(location, uuid.Nil) {
		return nil, shared.ErrConflict
	}
	m := &Menu{ID: uuid.New(), Name: name, Location: location, CreatedAt: r.now, UpdatedAt: r.now}
	r.menus[m.ID] = m
	cp := *m
	return &cp, nil
}

func (r *fakeRepo) UpdateMenu(_ context.Context, id uuid.UUID, name, location string) (*Menu, error) {
	m, ok := r.menus[id]
	if !ok {
		return nil, shared.ErrNotFound
	}
	if r.locationTaken(location, id) {
		return nil, shared.ErrConflict
	}
	m.Name, m.Location, m.UpdatedAt = name, location, r.now.Add(time.Second)
	cp := *m
	return &cp, nil
}

func (r *fakeRepo) DeleteMenu(_ context.Context, id uuid.UUID) error {
	delete(r.menus, id)
	delete(r.menuItems, id)
	return nil
}

func (r *fakeRepo) ItemExists(_ context.Context, itemID uuid.UUID) (bool, error) {
	for _, items := range r.menuItems {
		for _, it := range items {
			if it.ID == itemID {
				return true, nil
			}
		}
	}
	return false, nil
}

func (r *fakeRepo) MenuItems(_ context.Context, menuID uuid.UUID) ([]itemRow, error) {
	rows := append([]itemRow(nil), r.menuItems[menuID]...)
	sort.Slice(rows, func(i, j int) bool { return rows[i].SortOrder < rows[j].SortOrder })
	return rows, nil
}

func (r *fakeRepo) ReplaceMenuItems(_ context.Context, menuID uuid.UUID, items []itemWrite) error {
	flat := []itemRow{}
	var insert func(parent *uuid.UUID, items []itemWrite)
	insert = func(parent *uuid.UUID, items []itemWrite) {
		for i, it := range items {
			row := itemRow{ID: uuid.New(), ParentID: parent, Label: it.Label, LinkType: it.LinkType,
				TargetID: it.TargetID, URL: it.URL, OpenNewTab: it.OpenNewTab, SortOrder: i}
			flat = append(flat, row)
			if len(it.Children) > 0 {
				insert(&row.ID, it.Children)
			}
		}
	}
	insert(nil, items)
	r.menuItems[menuID] = flat
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
