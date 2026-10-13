package pages

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionCreated     = "page.created"
	actionUpdated     = "page.updated"
	actionPublished   = "page.published"
	actionUnpublished = "page.unpublished"
	actionDeleted     = "page.deleted"
)

// pageEntry builds an entry pointed at a page, labelled with the title as it
// was at that moment; meta may be nil.
func pageEntry(action string, pageID uuid.UUID, title string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: EntityPage, EntityID: &pageID,
		EntityLabel: title, Metadata: meta,
	}
}
