package users

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionCreated      = "user.created"
	actionUpdated      = "user.updated"
	actionDisabled     = "user.disabled"
	actionDeleted      = "user.deleted"
	actionRoleAssigned = "user.role_assigned"
	actionRoleRemoved  = "user.role_removed"
	actionResetSent    = "user.password_reset_sent"
)

// entityUser is the account the action happened to — the target, never the
// admin performing it (that is the actor).
const entityUser = "user"

// userEntry builds an entry pointed at the target account. The name is passed
// in rather than joined on read because a hard-deleted account still has to be
// nameable; meta may be nil.
func userEntry(action string, target uuid.UUID, fullName string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityUser, EntityID: &target,
		EntityLabel: fullName, Metadata: meta,
	}
}
