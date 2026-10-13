// Package activity is the read side of the activity log: who did what to what,
// and when. It is read-only by design — nothing here writes the table. The
// recorder lives in internal/platform/activity and is called by the modules
// that change state.
//
// Rows are read WITHOUT a join. actor_label and entity_label are snapshots
// taken at write time precisely so a hard-deleted user or a deleted record is
// still nameable; joining users here would undo that and leave the log saying
// only that somebody changed something.
package activity

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const permRead = "activity.read"

const (
	defaultPageSize = 20
	maxPageSize     = 100
	// minQueryLen: a one-character substring matches nearly every row, so it
	// buys nothing and pays the full scan described on searchWindow.
	minQueryLen = 2
	// searchWindow bounds a free-text search that arrives without a date range.
	// See the note on Repository.List for why the bound is not optional.
	searchWindow = 90 * 24 * time.Hour
)

// Entry is one logged action as returned by the API.
type Entry struct {
	ID         int64     `json:"id"`
	OccurredAt time.Time `json:"occurred_at"`
	// Action is a stable code such as "article.publish". The console renders
	// its own label per language and falls back to the code itself.
	Action string `json:"action"`
	// Entity/EntityID/EntityLabel describe the target; all three are absent for
	// an action that targets nothing in particular, such as a sign-in.
	Entity      *string    `json:"entity"`
	EntityID    *uuid.UUID `json:"entity_id"`
	EntityLabel *string    `json:"entity_label"`
	// ActorID is nil when the system acted on its own; ActorLabel then reads
	// "system" rather than being blamed on whoever configured the schedule.
	ActorID    *uuid.UUID `json:"actor_id"`
	ActorLabel string     `json:"actor_label"`

	IP            *string `json:"ip"`
	CorrelationID *string `json:"correlation_id"`
	// Metadata is passed through verbatim: it is the writer's context, and this
	// side has no business reshaping it.
	Metadata json.RawMessage `json:"metadata"`
}

// ListParams is the resolved query. Every field but Query maps onto one of the
// table's indexes — see Repository.List.
type ListParams struct {
	Query    string
	ActorID  *uuid.UUID
	Action   string
	Entity   string
	EntityID *uuid.UUID
	From     time.Time
	To       time.Time
	Page     int
	PageSize int
}

// ListResponse is the paginated envelope.
type ListResponse struct {
	Items    []Entry `json:"items"`
	Total    int     `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"page_size"`
	// SearchFrom is the window a free-text search was clamped to when the
	// caller gave no date range. Reported rather than applied silently: a
	// search that quietly ignores last year's rows is a wrong answer.
	SearchFrom *time.Time `json:"search_from,omitempty"`
}

// ActionsResponse lists the action codes actually present in the log, so the
// console builds its filter from the data instead of a list that drifts.
type ActionsResponse struct {
	Items []string `json:"items"`
}
