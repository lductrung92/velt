package leads

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// Stable action codes for the activity log. They are codes, not prose: the
// console filters on them and renders its own label per language, so renaming
// one here orphans every row already written under the old name.
//
// CaptureFromChat has no code of its own. It is the visitor's act, not an
// operator's — there is no identity to attribute it to and nobody to hold to
// account for it — so it stays in the JSON log where the assistant's other
// traffic is.
const (
	actionCreated = "lead.created"
	actionUpdated = "lead.updated"
	actionDeleted = "lead.deleted"
)

// entityLead is the lead the action happened to.
const entityLead = "lead"

// leadEntry builds an entry pointed at a lead; meta may be nil.
func leadEntry(action string, leadID uuid.UUID, label string, meta map[string]any) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entityLead, EntityID: &leadID,
		EntityLabel: label, Metadata: meta,
	}
}

// leadLabel is how a lead is known. A name is optional here — the form only
// insists on one way to reach them — so the first contact that is filled in
// stands in for it; without that the row would name nothing at all.
func leadLabel(l *Lead) string {
	for _, v := range []*string{l.Name, l.Email, l.Phone, l.Zalo} {
		if v != nil && *v != "" {
			return *v
		}
	}
	return ""
}
