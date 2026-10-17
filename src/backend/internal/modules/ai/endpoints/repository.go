package endpoints

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when an id names no row.
var ErrNotFound = errors.New("not found")

// Repository reads and writes the endpoints and the chains.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository wires the store onto a pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const providerCols = `id, label, kind, base_url, api_key IS NOT NULL, enabled, sort_order, created_at, updated_at`

// ProviderLabel returns the operator-facing name of one endpoint, for an
// audit entry. The kind ("openai") would say nothing about WHICH endpoint was
// read, which is the only question such an entry exists to answer.
func (r *Repository) ProviderLabel(ctx context.Context, id uuid.UUID) (string, error) {
	var label string
	err := r.pool.QueryRow(ctx,
		`SELECT label FROM ai_providers WHERE id = $1`, id).Scan(&label)
	if err != nil {
		return "", fmt.Errorf("provider label: %w", err)
	}
	return label, nil
}

// SealedKeys returns every endpoint's stored key, still encrypted.
//
// One query rather than one per endpoint: the console's list wants to say how
// many keys each endpoint holds, and the only way to count them is to open the
// blob — the keys live newline-separated inside a single sealed value.
func (r *Repository) SealedKeys(ctx context.Context) (map[uuid.UUID][]byte, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, api_key FROM ai_providers WHERE api_key IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("sealed keys: %w", err)
	}
	defer rows.Close()
	out := map[uuid.UUID][]byte{}
	for rows.Next() {
		var id uuid.UUID
		var key []byte
		if err := rows.Scan(&id, &key); err != nil {
			return nil, fmt.Errorf("scan sealed key: %w", err)
		}
		out[id] = key
	}
	return out, rows.Err()
}

// ListProviders returns every endpoint in display order.
func (r *Repository) ListProviders(ctx context.Context) ([]Provider, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+providerCols+` FROM ai_providers ORDER BY sort_order, created_at`)
	if err != nil {
		return nil, fmt.Errorf("list providers: %w", err)
	}
	defer rows.Close()
	out := []Provider{}
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.ID, &p.Label, &p.Kind, &p.BaseURL, &p.HasKey,
			&p.Enabled, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan provider: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// CreateProvider inserts one endpoint. key is the sealed blob, nil for none.
func (r *Repository) CreateProvider(ctx context.Context, in CreateProviderRequest, key []byte) (*Provider, error) {
	enabled := true
	if in.Enabled != nil {
		enabled = *in.Enabled
	}
	var p Provider
	err := r.pool.QueryRow(ctx,
		`INSERT INTO ai_providers (label, kind, base_url, api_key, enabled, sort_order)
		 VALUES ($1, $2, $3, $4, $5,
		         COALESCE((SELECT MAX(sort_order) + 1 FROM ai_providers), 0))
		 RETURNING `+providerCols,
		in.Label, in.Kind, in.BaseURL, key, enabled).
		Scan(&p.ID, &p.Label, &p.Kind, &p.BaseURL, &p.HasKey,
			&p.Enabled, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create provider: %w", err)
	}
	return &p, nil
}

// UpdateProvider applies a PATCH. setKey distinguishes "leave the stored key"
// from "replace it" — a nil key with setKey true clears it.
func (r *Repository) UpdateProvider(
	ctx context.Context, id uuid.UUID, in UpdateProviderRequest, key []byte, setKey bool,
) (*Provider, error) {
	var p Provider
	err := r.pool.QueryRow(ctx,
		`UPDATE ai_providers SET
		   label      = COALESCE($2, label),
		   kind       = COALESCE($3, kind),
		   base_url   = COALESCE($4, base_url),
		   api_key    = CASE WHEN $5 THEN $6 ELSE api_key END,
		   enabled    = COALESCE($7, enabled),
		   updated_at = now()
		 WHERE id = $1
		 RETURNING `+providerCols,
		id, in.Label, in.Kind, in.BaseURL, setKey, key, in.Enabled).
		Scan(&p.ID, &p.Label, &p.Kind, &p.BaseURL, &p.HasKey,
			&p.Enabled, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update provider: %w", err)
	}
	return &p, nil
}

// DeleteProvider removes an endpoint; its chain steps cascade away with it.
func (r *Repository) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM ai_providers WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete provider: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderProviders rewrites display order from the given sequence.
func (r *Repository) ReorderProviders(ctx context.Context, ids []uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_providers p SET sort_order = o.ord, updated_at = now()
		 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
		 WHERE p.id = o.id`, ids)
	if err != nil {
		return fmt.Errorf("reorder providers: %w", err)
	}
	return nil
}

// Chain returns one purpose's steps in priority order, enabled or not.
func (r *Repository) Chain(ctx context.Context, purpose string) ([]Step, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.id, m.purpose, m.provider_id, p.label, p.enabled, m.model, m.sort_order
		   FROM ai_purpose_models m
		   JOIN ai_providers p ON p.id = m.provider_id
		  WHERE m.purpose = $1
		  ORDER BY m.sort_order, m.created_at`, purpose)
	if err != nil {
		return nil, fmt.Errorf("chain: %w", err)
	}
	defer rows.Close()
	out := []Step{}
	for rows.Next() {
		var s Step
		if err := rows.Scan(&s.ID, &s.Purpose, &s.ProviderID, &s.ProviderLabel,
			&s.ProviderEnabled, &s.Model, &s.SortOrder); err != nil {
			return nil, fmt.Errorf("scan step: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SetChain replaces a purpose's chain in one transaction. The submitted order
// IS the priority, so the whole list is rewritten rather than patched.
func (r *Repository) SetChain(ctx context.Context, purpose string, steps []ChainStepInput) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("set chain: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM ai_purpose_models WHERE purpose = $1`, purpose); err != nil {
		return fmt.Errorf("set chain: clear: %w", err)
	}
	for i, st := range steps {
		if _, err := tx.Exec(ctx,
			`INSERT INTO ai_purpose_models (purpose, provider_id, model, sort_order)
			 VALUES ($1, $2, $3, $4)`, purpose, st.ProviderID, st.Model, i); err != nil {
			return fmt.Errorf("set chain: insert: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// ResolveChain returns what a caller needs to actually run a purpose: the
// enabled steps, in order, each with its endpoint's sealed key.
//
// Disabled endpoints are filtered HERE rather than by the caller, so turning
// one off in the console takes it out of every chain at once.
func (r *Repository) ResolveChain(ctx context.Context, purpose string) ([]Resolved, [][]byte, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.label, p.kind, p.base_url, p.api_key, m.model
		   FROM ai_purpose_models m
		   JOIN ai_providers p ON p.id = m.provider_id
		  WHERE m.purpose = $1 AND p.enabled
		  ORDER BY m.sort_order, m.created_at`, purpose)
	if err != nil {
		return nil, nil, fmt.Errorf("resolve chain: %w", err)
	}
	defer rows.Close()
	out := []Resolved{}
	keys := [][]byte{}
	for rows.Next() {
		var rv Resolved
		var key []byte
		if err := rows.Scan(&rv.ProviderID, &rv.ProviderLabel, &rv.Kind,
			&rv.BaseURL, &key, &rv.Model); err != nil {
			return nil, nil, fmt.Errorf("scan resolved: %w", err)
		}
		out = append(out, rv)
		keys = append(keys, key)
	}
	return out, keys, rows.Err()
}

// ProviderConfig returns one endpoint's call details, key still sealed.
func (r *Repository) ProviderConfig(ctx context.Context, id uuid.UUID) (kind, baseURL string, key []byte, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT kind, base_url, api_key FROM ai_providers WHERE id = $1`, id).
		Scan(&kind, &baseURL, &key)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, ErrNotFound
	}
	if err != nil {
		return "", "", nil, fmt.Errorf("provider config: %w", err)
	}
	return kind, baseURL, key, nil
}
