package regions

import (
	"encoding/json"

	"github.com/velt/backend/internal/apperr"
	"github.com/velt/backend/internal/modules/cms/widgets"
)

// isKnownGroup reports whether group is a node of the page tree.
func isKnownGroup(group string) bool {
	_, ok := parentOf[group]
	return ok
}

// allowsSlot reports whether that kind of page has that place in its markup.
func allowsSlot(group, slot string) bool {
	for _, s := range SlotsFor(group) {
		if s == slot {
			return true
		}
	}
	return false
}

// toBlockWrites validates each block by kind and converts it to a persistence
// node, keeping only the kind-relevant target (widget_type XOR menu_id) so a
// kind switched in the editor cannot leave the other one behind.
//
// Validating and converting are one pass here, unlike menus' two: a widget's
// config is checked by widgets.SanitizeConfig, which ANSWERS with the config to
// store (canonical JSON, rich_text HTML run through the allowlist). Splitting
// them would mean sanitizing twice or storing the unsanitized copy.
//
// menu_id's existence is not checked here — that needs the database, so the
// service does it.
func toBlockWrites(blocks []BlockInput) ([]blockWrite, error) {
	out := make([]blockWrite, 0, len(blocks))
	for _, b := range blocks {
		w := blockWrite{ID: b.ID, Kind: b.Kind, IsVisible: b.IsVisible}
		switch b.Kind {
		case KindWidget:
			if b.WidgetType == nil || !widgets.IsKnownType(*b.WidgetType) {
				return nil, apperr.Validation(map[string]string{"widget_type": "unknown"})
			}
			config, err := widgets.SanitizeConfig(*b.WidgetType, b.Config)
			if err != nil {
				return nil, err
			}
			w.WidgetType, w.Config = b.WidgetType, config
		case KindMenu:
			if b.MenuID == nil {
				return nil, apperr.Validation(map[string]string{"menu_id": "required"})
			}
			// A menu block has no config of its own: the menu is the content.
			w.MenuID, w.Config = b.MenuID, json.RawMessage(`{}`)
		default:
			return nil, apperr.Validation(map[string]string{"kind": "unknown"})
		}
		out = append(out, w)
	}
	return out, nil
}
