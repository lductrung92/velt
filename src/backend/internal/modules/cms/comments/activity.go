package comments

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
const (
	actionModerated = "comment.moderated"
	actionDeleted   = "comment.deleted"
)

// entityComment is the comment the decision was made about.
const entityComment = "comment"

// commentEntry builds an entry pointed at a comment. A comment has no name, so
// it is labelled by its author — the body stays out of the log, which is a
// moderation record, not a copy of what was moderated.
func commentEntry(action string, commentID uuid.UUID, authorName string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityComment, EntityID: &commentID,
		EntityLabel: authorName, Metadata: meta,
	}
}
