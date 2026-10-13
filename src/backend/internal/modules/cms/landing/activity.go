package landing

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
//
// A section has no name and is never looked up on its own, so the four section
// codes point at the landing that owns it and carry the section in metadata —
// "what happened to this landing" then answers for its sections too.
const (
	actionCreated           = "landing.created"
	actionUpdated           = "landing.updated"
	actionDeleted           = "landing.deleted"
	actionPublished         = "landing.published"
	actionUnpublished       = "landing.unpublished"
	actionSectionAdded      = "landing.section_added"
	actionSectionUpdated    = "landing.section_updated"
	actionSectionRemoved    = "landing.section_removed"
	actionSectionsReordered = "landing.sections_reordered"
)

// entityLanding is the landing page the action happened to.
const entityLanding = "landing"

// landingEntry builds an entry pointed at a landing page, labelled with the
// name as it was at that moment; meta may be nil.
func landingEntry(action string, landingID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityLanding, EntityID: &landingID,
		EntityLabel: name, Metadata: meta,
	}
}
