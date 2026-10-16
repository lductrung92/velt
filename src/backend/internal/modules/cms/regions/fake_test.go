package regions

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/modules/cms/shared/cmstest"
)

// fakeRepo is an in-memory region block Repository for service unit tests. Its
// replace keeps the ids it is handed, like the real one.
type fakeRepo struct {
	blocks map[[2]string][]blockRow
	menus  map[uuid.UUID]bool
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{blocks: map[[2]string][]blockRow{}, menus: map[uuid.UUID]bool{}}
}

// list keys one (group, slot) the way the fake stores it.
func list(group, slot string) [2]string { return [2]string{group, slot} }

// withMenu registers a menu id as existing, so a menu block may point at it.
func (r *fakeRepo) withMenu() uuid.UUID {
	id := uuid.New()
	r.menus[id] = true
	return id
}

func (r *fakeRepo) AllBlocks(_ context.Context) ([]blockRow, error) {
	out := []blockRow{}
	for _, group := range Groups {
		for _, slot := range SlotsFor(group) {
			out = append(out, r.blocks[list(group, slot)]...)
		}
	}
	return out, nil
}

func (r *fakeRepo) RegionBlocks(_ context.Context, group, slot string) ([]blockRow, error) {
	return append([]blockRow(nil), r.blocks[list(group, slot)]...), nil
}

func (r *fakeRepo) MenuExists(_ context.Context, menuID uuid.UUID) (bool, error) {
	return r.menus[menuID], nil
}

func (r *fakeRepo) BlockExists(_ context.Context, blockID uuid.UUID) (bool, error) {
	for _, rows := range r.blocks {
		for _, row := range rows {
			if row.ID == blockID {
				return true, nil
			}
		}
	}
	return false, nil
}

func (r *fakeRepo) ReplaceRegionBlocks(_ context.Context, group, slot string, blocks []blockWrite) ([]uuid.UUID, error) {
	kept := map[uuid.UUID]bool{}
	for _, b := range blocks {
		if b.ID != nil {
			kept[*b.ID] = true
		}
	}
	removed := []uuid.UUID{}
	for _, row := range r.blocks[list(group, slot)] {
		if !kept[row.ID] {
			removed = append(removed, row.ID)
		}
	}
	rows := make([]blockRow, 0, len(blocks))
	for _, b := range blocks {
		id := uuid.New()
		if b.ID != nil {
			id = *b.ID
		}
		rows = append(rows, blockRow{
			ID: id, Group: group, Region: slot, Kind: b.Kind, WidgetType: b.WidgetType,
			MenuID: b.MenuID, Config: b.Config, IsVisible: b.IsVisible,
		})
	}
	r.blocks[list(group, slot)] = rows
	return removed, nil
}

type tenv struct {
	svc  *Service
	repo *fakeRepo
}

func newTestSvc(t *testing.T) *tenv {
	t.Helper()
	repo := newFakeRepo()
	base := shared.NewBase(&cmstest.FakeSettings{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return &tenv{svc: NewService(base, repo), repo: repo}
}

// fakeTranslator stands in for the translation module: one language's copy of a
// block, shaped the way Bundle returns it, plus the purges it was asked for.
type fakeTranslator struct {
	values map[uuid.UUID]map[string]map[string]any
	purged []uuid.UUID
}

func newFakeTranslator() *fakeTranslator {
	return &fakeTranslator{values: map[uuid.UUID]map[string]map[string]any{}}
}

// withConfig stores one block's translated config for one locale.
func (f *fakeTranslator) withConfig(id uuid.UUID, locale string, config map[string]any) {
	if f.values[id] == nil {
		f.values[id] = map[string]map[string]any{}
	}
	f.values[id][locale] = map[string]any{"config": config}
}

func (f *fakeTranslator) Bundle(_ context.Context, _ string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	out := map[uuid.UUID]map[string]map[string]any{}
	for _, id := range ids {
		for _, locale := range locales {
			if v, ok := f.values[id][locale]; ok {
				if out[id] == nil {
					out[id] = map[string]map[string]any{}
				}
				out[id][locale] = v
			}
		}
	}
	return out, nil
}

func (f *fakeTranslator) Purge(_ context.Context, _ string, id uuid.UUID) error {
	f.purged = append(f.purged, id)
	return nil
}
