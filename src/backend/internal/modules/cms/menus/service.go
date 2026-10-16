package menus

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/cms/shared"
	"github.com/velt/backend/internal/platform/localize"
)

// Translator is the slice of the translation module this module needs. It is
// an interface declared here, satisfied at wiring time, and allowed to be nil —
// nil means "no translations", which is also what the feature switched off
// looks like.
type Translator interface {
	Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error)
}

// EntityItem is this module's key in the translation store: a menu item's
// label, written where the item is.
const EntityItem = "menu_item"

// Service holds menu business logic.
type Service struct {
	*shared.Base
	repo Repository
	tr   Translator
}

// SetTranslator wires the translation port (called once at startup).
func (s *Service) SetTranslator(t Translator) { s.tr = t }

// NewService wires the menus service onto the shared CMS base.
func NewService(base *shared.Base, repo Repository) *Service {
	return &Service{Base: base, repo: repo}
}

// ListMenus returns all navigation slots (no items). Requires cms.menu.manage.
func (s *Service) ListMenus(ctx context.Context, id *httpx.Identity) ([]Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return nil, err
	}
	menus, err := s.repo.ListMenus(ctx)
	if err != nil {
		return nil, apperr.Internal()
	}
	out := make([]Response, 0, len(menus))
	for _, m := range menus {
		out = append(out, toResponse(m))
	}
	return out, nil
}

// GetMenu returns a slot + its item tree. Requires cms.menu.manage.
func (s *Service) GetMenu(ctx context.Context, id *httpx.Identity, menuID uuid.UUID, locale string) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	m, err := s.repo.GetMenu(ctx, menuID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	return s.menuDetail(ctx, *m, locale)
}

// CreateMenu creates a navigation slot. Requires cms.menu.manage. Several slots
// may share a location; which one the site renders is menus.oldestMenu.
func (s *Service) CreateMenu(ctx context.Context, id *httpx.Identity, req CreateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	name, location := strings.TrimSpace(req.Name), strings.TrimSpace(req.Location)
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	if location == "" {
		return Response{}, apperr.Validation(map[string]string{"location": "required"})
	}
	m, err := s.repo.CreateMenu(ctx, name, location)
	if err != nil {
		return Response{}, mapWriteErr(err)
	}
	s.Sec(ctx).Info("cms menu created", "actor", id.UserID, "menu", m.ID, "location", m.Location)
	s.Record(ctx, id, menuEntry(actionCreated, m.ID, m.Name, map[string]any{"location": m.Location}))
	return toResponse(*m), nil
}

// UpdateMenu patches a slot's name/location. Requires cms.menu.manage.
func (s *Service) UpdateMenu(ctx context.Context, id *httpx.Identity, menuID uuid.UUID, req UpdateRequest) (Response, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return Response{}, err
	}
	cur, err := s.repo.GetMenu(ctx, menuID)
	if err != nil {
		return Response{}, mapGetErr(err)
	}
	name, location := cur.Name, cur.Location
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if req.Location != nil {
		location = strings.TrimSpace(*req.Location)
	}
	if name == "" {
		return Response{}, apperr.Validation(map[string]string{"name": "required"})
	}
	if location == "" {
		return Response{}, apperr.Validation(map[string]string{"location": "required"})
	}
	m, err := s.repo.UpdateMenu(ctx, menuID, name, location)
	if err != nil {
		return Response{}, mapWriteErr(err)
	}
	s.Sec(ctx).Info("cms menu updated", "actor", id.UserID, "menu", menuID)
	s.Record(ctx, id, menuEntry(actionUpdated, menuID, m.Name, map[string]any{"location": m.Location}))
	return toResponse(*m), nil
}

// DeleteMenu removes a slot (items cascade). Requires cms.menu.manage.
func (s *Service) DeleteMenu(ctx context.Context, id *httpx.Identity, menuID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	// Read before the delete: the name has to outlive the row it came from.
	cur, err := s.repo.GetMenu(ctx, menuID)
	if err != nil {
		return mapGetErr(err)
	}
	if err := s.repo.DeleteMenu(ctx, menuID); err != nil {
		return apperr.Internal()
	}
	s.Sec(ctx).Info("cms menu deleted", "actor", id.UserID, "menu", menuID)
	s.Record(ctx, id, menuEntry(actionDeleted, menuID, cur.Name, map[string]any{"location": cur.Location}))
	return nil
}

// ReplaceMenuItems swaps the whole item tree of a menu (transactional). Requires
// cms.menu.manage. Validates each node by link_type (internal/external URL,
// article/page/category target_id); external URL is SSRF/open-redirect guarded.
func (s *Service) ReplaceMenuItems(ctx context.Context, id *httpx.Identity, menuID uuid.UUID, req ItemsRequest, locale string) (DetailResponse, error) {
	if err := s.Require(ctx, id, permManage); err != nil {
		return DetailResponse{}, err
	}
	m, err := s.repo.GetMenu(ctx, menuID)
	if err != nil {
		return DetailResponse{}, mapGetErr(err)
	}
	if err := validateItems(req.Items); err != nil {
		return DetailResponse{}, err
	}
	if err := s.repo.ReplaceMenuItems(ctx, menuID, toItemWrites(req.Items)); err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	s.Sec(ctx).Info("cms menu items replaced", "actor", id.UserID, "menu", menuID, "roots", len(req.Items))
	s.Record(ctx, id, menuEntry(actionItemsReplaced, menuID, m.Name, map[string]any{"roots": len(req.Items)}))
	return s.menuDetail(ctx, *m, locale)
}

// menuDetail reads a slot's item tree. Each node's LabelDisplay answers in the
// request locale where somebody has written a translation; Label never moves —
// see ItemNode.
func (s *Service) menuDetail(ctx context.Context, m Menu, locale string) (DetailResponse, error) {
	rows, err := s.repo.MenuItems(ctx, m.ID)
	if err != nil {
		return DetailResponse{}, apperr.Internal()
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	tr := localize.Fields(ctx, s.tr, EntityItem, locale, ids)
	return DetailResponse{Response: toResponse(m), Items: buildItemTree(rows, tr)}, nil
}

func mapGetErr(err error) error {
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}

func mapWriteErr(err error) error {
	if errors.Is(err, shared.ErrNotFound) {
		return apperr.NotFound("not_found")
	}
	return apperr.Internal()
}

// AuthorizeTranslate gates editing a menu item's translated label, on the same
// permission as editing the menu itself: translating a link is editing the menu.
func (s *Service) AuthorizeTranslate(ctx context.Context, id *httpx.Identity, itemID uuid.UUID) error {
	if err := s.Require(ctx, id, permManage); err != nil {
		return err
	}
	ok, err := s.repo.ItemExists(ctx, itemID)
	if err != nil {
		return apperr.Internal()
	}
	if !ok {
		return apperr.NotFound("not_found")
	}
	return nil
}
