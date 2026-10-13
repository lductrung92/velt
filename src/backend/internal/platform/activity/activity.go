// Package activity records deliberate human actions, so that "who changed
// this, and when" has an answer.
//
// It is NOT the application log. The JSON log keeps the technical detail —
// errors, timings, cancelled requests — and the two are tied together by the
// correlation id. What lands here is narrower on purpose: a person changed
// state that somebody may later have to account for. Letting diagnostics in
// would bury the handful of rows anyone actually comes looking for.
//
// Writes are best-effort. A recorder that fails logs a warning and returns; it
// never fails the action it describes. That is a deliberate trade: this is an
// operational record for tracing work, not a ledger that has to survive an
// audit. Making it blocking would mean a hiccup in this table can roll back a
// legitimate publish.
package activity

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
)

// Entry is one recorded action.
type Entry struct {
	// Action is a stable code such as "article.publish". Never prose: the
	// console filters on it and renders its own label per language.
	Action string
	// Entity and EntityID say what was acted on. Both may be empty for an
	// action that targets nothing in particular, such as a sign-in.
	Entity   string
	EntityID *uuid.UUID
	// EntityLabel is the target's name AS IT WAS. Stored rather than joined:
	// the record may be gone by the time anyone reads this row.
	EntityLabel string
	// Metadata carries the rest. NEVER a secret value — a settings change
	// records which key moved, not what it moved to.
	Metadata map[string]any
}

// Recorder writes entries. The content modules take this interface, not the
// concrete store, so their tests need no database.
type Recorder interface {
	Record(ctx context.Context, id *httpx.Identity, e Entry)
}

// Store is the Postgres recorder.
type Store struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

// New builds the recorder.
func New(pool *pgxpool.Pool, log *slog.Logger) *Store {
	if log == nil {
		log = slog.Default()
	}
	return &Store{pool: pool, log: log}
}

// Record writes one entry. A nil identity means the system acted on its own —
// a scheduled publish, a cron — and is stored as such rather than being blamed
// on whoever happened to configure it.
func (s *Store) Record(ctx context.Context, id *httpx.Identity, e Entry) {
	if s == nil || s.pool == nil {
		return
	}
	meta := e.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		s.warn(ctx, e, fmt.Errorf("encode metadata: %w", err))
		return
	}

	var actorID *uuid.UUID
	if id != nil {
		actorID = &id.UserID
	}

	// A background context on purpose: the row describes an action that has
	// already happened, so a client that hangs up mid-response must not erase
	// the record of it.
	if _, err := s.pool.Exec(context.WithoutCancel(ctx),
		`INSERT INTO activity_log
		        (action, entity, entity_id, entity_label, actor_id, actor_label,
		         ip, correlation_id, metadata)
		 VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5,
		         -- Resolved here and stored, not joined on read: a hard-deleted
		         -- user must still be nameable, or the row only says that
		         -- somebody changed something.
		         COALESCE((SELECT full_name FROM users WHERE id = $5), 'system'),
		         NULLIF($6, '')::inet, NULLIF($7, ''), $8)`,
		e.Action, e.Entity, e.EntityID, e.EntityLabel, actorID,
		httpx.ClientIPFromContext(ctx),
		httpx.CorrelationIDFromContext(ctx), raw); err != nil {
		s.warn(ctx, e, err)
	}
}

// warn reports a lost entry loudly enough to notice. A log that silently drops
// rows is worse than no log, because people trust it.
func (s *Store) warn(ctx context.Context, e Entry, err error) {
	s.log.With("correlation_id", httpx.CorrelationIDFromContext(ctx)).
		Warn("activity not recorded", "action", e.Action, "entity", e.Entity, "err", err)
}
