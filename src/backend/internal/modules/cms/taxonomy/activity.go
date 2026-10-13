package taxonomy

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name. The entity
// prefixes are the same ones the translation store uses (translate.go).
const (
	actionCategoryCreated = "cms_category.created"
	actionCategoryUpdated = "cms_category.updated"
	actionCategoryDeleted = "cms_category.deleted"
	actionTagCreated      = "tag.created"
	actionTagUpdated      = "tag.updated"
	actionTagDeleted      = "tag.deleted"
	actionTagMerged       = "tag.merged"
)

// taxonomyEntry builds an entry pointed at a category or a tag, labelled with
// the name as it was at that moment; meta may be nil.
func taxonomyEntry(action, entity string, termID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entity, EntityID: &termID,
		EntityLabel: name, Metadata: meta,
	}
}
