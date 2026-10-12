package translation

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Values is one record's translated fields in one language. A field present but
// empty means "deliberately left untranslated" and falls back at publish time; a
// field absent means the same thing. Both are kept as the translator typed them
// so the console's progress count stays honest.
type Values map[string]any

// Record is one stored translation.
type Record struct {
	Locale    string    `json:"-"`
	Values    Values    `json:"values"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Store reads and writes the translations table.
type Store struct{ pool *pgxpool.Pool }

// NewStore builds the translation store.
func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Get returns every language stored for one record, keyed by locale.
func (s *Store) Get(ctx context.Context, entity string, id uuid.UUID) (map[string]Record, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT locale, values, updated_at FROM translations
		  WHERE entity = $1 AND entity_id = $2 ORDER BY locale`, entity, id)
	if err != nil {
		return nil, fmt.Errorf("translations get: %w", err)
	}
	defer rows.Close()
	out := map[string]Record{}
	for rows.Next() {
		var r Record
		var raw []byte
		if err := rows.Scan(&r.Locale, &raw, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("translations scan: %w", err)
		}
		if err := json.Unmarshal(raw, &r.Values); err != nil {
			return nil, fmt.Errorf("translations decode: %w", err)
		}
		out[r.Locale] = r
	}
	return out, rows.Err()
}

// Upsert replaces one record's values for one language.
func (s *Store) Upsert(ctx context.Context, entity string, id uuid.UUID, locale string, v Values) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("translations encode: %w", err)
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO translations (entity, entity_id, locale, values, updated_at)
		 VALUES ($1, $2, $3, $4, now())
		 ON CONFLICT (entity, entity_id, locale)
		 DO UPDATE SET values = EXCLUDED.values, updated_at = now()`,
		entity, id, locale, raw); err != nil {
		return fmt.Errorf("translations upsert: %w", err)
	}
	return nil
}

// Delete drops one language of one record. Distinct from storing empty values:
// this removes the row, which is a different button on the screen.
func (s *Store) Delete(ctx context.Context, entity string, id uuid.UUID, locale string) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM translations WHERE entity = $1 AND entity_id = $2 AND locale = $3`,
		entity, id, locale); err != nil {
		return fmt.Errorf("translations delete: %w", err)
	}
	return nil
}

// Bundle loads translations for many records at once, keyed by id then locale.
//
// One query for a whole page, never one per row: a 20-item list has to stay one
// round-trip.
func (s *Store) Bundle(ctx context.Context, entity string, ids []uuid.UUID, locales []string) (map[uuid.UUID]map[string]map[string]any, error) {
	out := map[uuid.UUID]map[string]map[string]any{}
	if len(ids) == 0 || len(locales) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT entity_id, locale, values FROM translations
		  WHERE entity = $1 AND entity_id = ANY($2) AND locale = ANY($3)`,
		entity, ids, locales)
	if err != nil {
		return nil, fmt.Errorf("translations bundle: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var locale string
		var raw []byte
		if err := rows.Scan(&id, &locale, &raw); err != nil {
			return nil, fmt.Errorf("translations scan bundle: %w", err)
		}
		var v map[string]any
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, fmt.Errorf("translations decode bundle: %w", err)
		}
		if out[id] == nil {
			out[id] = map[string]map[string]any{}
		}
		out[id][locale] = v
	}
	return out, rows.Err()
}

// Purge removes every language of one record, called by the owning module when
// it deletes the record.
func (s *Store) Purge(ctx context.Context, entity string, id uuid.UUID) error {
	if _, err := s.pool.Exec(ctx,
		`DELETE FROM translations WHERE entity = $1 AND entity_id = $2`, entity, id); err != nil {
		return fmt.Errorf("translations purge: %w", err)
	}
	return nil
}

// RequiresRepublish reports whether a stored translation is newer than the
// published document that should be carrying it — i.e. somebody translated and
// has not pressed Publish since.
//
// It compares against written_at, not published_at: published_at is the
// editorial date shown to readers and is often older than the row itself, which
// would make every article look permanently out of date.
//
// Reading published_docs from here is a deliberate shortcut: the two tables are
// the two halves of the same answer, and the alternative is making every content
// module compute it again.
func (s *Store) RequiresRepublish(ctx context.Context, entity string, id uuid.UUID) (bool, error) {
	var stale bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (
		    SELECT 1
		      FROM published_docs d
		      JOIN translations t
		        ON t.entity = d.entity AND t.entity_id = d.entity_id
		     WHERE d.entity = $1 AND d.entity_id = $2 AND d.is_current
		       AND t.updated_at > d.written_at)`,
		entity, id).Scan(&stale)
	if err != nil {
		return false, fmt.Errorf("translations republish check: %w", err)
	}
	return stale, nil
}
