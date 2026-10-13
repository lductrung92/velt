package categories

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name. The entity
// prefix is the same one the translation store uses (translate.go).
const (
	actionCreated = "product_category.created"
	actionUpdated = "product_category.updated"
	actionDeleted = "product_category.deleted"
)

// categoryEntry builds an entry pointed at a category, labelled with the name
// as it was at that moment; meta may be nil.
func categoryEntry(action string, catID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: EntityCategory, EntityID: &catID,
		EntityLabel: name, Metadata: meta,
	}
}
