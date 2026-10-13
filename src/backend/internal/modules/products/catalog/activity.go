package catalog

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
//
// The gallery, the category set and the member list are edited through their
// own endpoints and are deliberately not here: they are parts of a product, and
// a row per caption would bury the six moves that matter.
const (
	actionCreated     = "product.created"
	actionUpdated     = "product.updated"
	actionPublished   = "product.published"
	actionUnpublished = "product.unpublished"
	actionArchived    = "product.archived"
	actionDeleted     = "product.deleted"
)

// productEntry builds an entry pointed at a product, labelled with the name as
// it was at that moment; meta may be nil.
func productEntry(action string, productID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: EntityProduct, EntityID: &productID,
		EntityLabel: name, Metadata: meta,
	}
}

// transitionAction names where the publication axis just moved to. The three
// destinations answer different questions ("when did this go live", "who took
// it down", "who shelved it"), so each keeps its own code.
func transitionAction(to string) string {
	switch to {
	case StatusPublished:
		return actionPublished
	case StatusArchived:
		return actionArchived
	default:
		return actionUnpublished
	}
}
