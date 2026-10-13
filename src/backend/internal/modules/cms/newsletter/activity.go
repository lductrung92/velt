package newsletter

import (
	"github.com/google/uuid"

	"github.com/velt/backend/internal/platform/activity"
)

// actionSubscriberDeleted is the one newsletter action an admin takes. A code,
// not prose: the console filters on it and renders its own label per language.
//
// Subscribing is deliberately absent. It is the visitor's own act, not an
// administrator's, and the form is open to the public — recording every opt-in
// here would drown the handful of rows this table exists for. The subscribe
// still lands in the JSON log.
const actionSubscriberDeleted = "newsletter_subscriber.deleted"

// entitySubscriber is the subscriber row that was removed.
const entitySubscriber = "newsletter_subscriber"

// subscriberEntry builds an entry pointed at a subscriber. The address is the
// only thing a subscriber has to be known by, so it is the label: without it
// the row says somebody deleted something.
func subscriberEntry(action string, subID uuid.UUID, email string) activity.Entry {
	return activity.Entry{
		Action: action, Entity: entitySubscriber, EntityID: &subID, EntityLabel: email,
	}
}
