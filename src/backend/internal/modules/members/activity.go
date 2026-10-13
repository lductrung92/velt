package members

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
//
// Avatar uploads and roster ordering are left out: they are adjustments to a
// member, not the arrival or departure of one, and the JSON log already carries
// them.
const (
	actionCreated = "member.created"
	actionUpdated = "member.updated"
	actionDeleted = "member.deleted"
)

// memberEntry builds an entry pointed at a member, labelled with the name as it
// was at that moment; meta may be nil.
func memberEntry(action string, memberID uuid.UUID, fullName string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: EntityMember, EntityID: &memberID,
		EntityLabel: fullName, Metadata: meta,
	}
}
