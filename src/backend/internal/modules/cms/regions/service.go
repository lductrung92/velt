package regions

import (
	"context"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
)

// Service holds region block business logic.
type Service struct {
	*shared.Base
	repo Repository
	// tr is wired after construction and may stay nil: without it a block has
	// no translated copy to drop.
	tr Translator
}

// NewService wires the regions service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListRegions returns every page group with every slot it allows and the
// blocks in it. Requires cms.page.view.
//
// Answers with the whole matrix, filled or not: an editor cannot place a block
// in a slot the screen never offered them, and an empty slot is the one that
// inherits — so leaving it out would hide exactly the case the screen exists
// to explain.
func (s *Service) ListRegions(ctx context.Context, id *httpx.Identity) ([]GroupResponse, error) {
	if err := s.Require(ctx, id, permView); err != nil {
		return nil, err
	}
	rows, err := s.repo.AllBlocks(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	byList := map[[2]string][]blockRow{}
	for _, r := range rows {
		key := [2]string{r.Group, r.Region}
		byList[key] = append(byList[key], r)
	}
	out := make([]GroupResponse, 0, len(Groups))
	for _, group := range Groups {
		slots := SlotsFor(group)
		g := GroupResponse{Group: group, Parent: parentOf[group], Slots: make([]SlotResponse, 0, len(slots))}
		for _, slot := range slots {
			g.Slots = append(g.Slots, SlotResponse{Slot: slot, Blocks: toBlocks(byList[[2]string{group, slot}])})
		}
		out = append(out, g)
	}
	return out, nil
}

// ReplaceRegionBlocks swaps the whole content of one (group, slot) list
// (transactional). Requires cms.menu.manage. Validates each block by kind: a
// widget's type and config against the widget registry, a menu's id against
// the menus table.
//
// The pair is checked against the matrix, not the two vocabularies separately:
// sidebar_left is a real slot and home is a real group, and ('home',
// 'sidebar_left') is still a block no page would ever draw.
func (s *Service) ReplaceRegionBlocks(ctx context.Context, id *httpx.Identity, group, slot string, req BlocksRequest) (SlotResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return SlotResponse{}, err
	}
	if !isKnownGroup(group) {
		return SlotResponse{}, apperr.Validation(map[string]string{"group": "unknown"})
	}
	if !allowsSlot(group, slot) {
		return SlotResponse{}, apperr.Validation(map[string]string{"slot": "unknown"})
	}
	writes, err := toBlockWrites(req.Blocks)
	if err != nil {
		return SlotResponse{}, err
	}
	for _, w := range writes {
		if w.MenuID == nil {
			continue
		}
		ok, err := s.repo.MenuExists(ctx, *w.MenuID)
		if err != nil {
			return SlotResponse{}, apperr.Internal()
		}
		if !ok {
			return SlotResponse{}, apperr.Validation(map[string]string{"menu_id": "not_found"})
		}
	}
	removed, err := s.repo.ReplaceRegionBlocks(ctx, group, slot, writes)
	if err != nil {
		return SlotResponse{}, apperr.Internal()
	}
	// A block left out of the list is gone, and its translated copy with it.
	s.purgeTranslations(ctx, removed)
	s.Sec(ctx).Info("cms region blocks replaced", "actor", id.UserID,
		"group", group, "slot", slot, "blocks", len(writes))
	return s.slotDetail(ctx, group, slot)
}

func (s *Service) slotDetail(ctx context.Context, group, slot string) (SlotResponse, error) {
	rows, err := s.repo.RegionBlocks(ctx, group, slot)
	if err != nil {
		return SlotResponse{}, apperr.Internal()
	}
	return SlotResponse{Slot: slot, Blocks: toBlocks(rows)}, nil
}
