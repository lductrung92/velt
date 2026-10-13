package menus

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
//
// Items are replaced as a whole tree, never one at a time, so the write that
// changed the navigation is one row against the slot it changed.
const (
	actionCreated       = "menu.created"
	actionUpdated       = "menu.updated"
	actionDeleted       = "menu.deleted"
	actionItemsReplaced = "menu.items_replaced"
)

// entityMenu is the navigation slot the action happened to.
const entityMenu = "menu"

// menuEntry builds an entry pointed at a menu, labelled with the name as it was
// at that moment; meta may be nil.
func menuEntry(action string, menuID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityMenu, EntityID: &menuID,
		EntityLabel: name, Metadata: meta,
	}
}
