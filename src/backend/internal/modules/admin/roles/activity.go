package roles

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionCreated        = "role.created"
	actionUpdated        = "role.updated"
	actionPermissionsSet = "role.permissions_set"
	actionDeleted        = "role.deleted"
)

// entityRole is the role the action happened to.
const entityRole = "role"

// roleEntry builds an entry pointed at a role, labelled with its name as it was
// at that moment; meta may be nil.
func roleEntry(action string, roleID uuid.UUID, name string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityRole, EntityID: &roleID,
		EntityLabel: name, Metadata: meta,
	}
}
