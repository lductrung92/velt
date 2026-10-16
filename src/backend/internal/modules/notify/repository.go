package notify

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when an id names no row.
var ErrNotFound = errors.New("not found")

// Repository stores push subscriptions.
type Repository struct{ pool *pgxpool.Pool }

// NewRepository wires the store onto a pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Upsert registers a browser, or refreshes the one already on this endpoint.
//
// Keyed by endpoint rather than by user: a browser that re-subscribes gets the
// same endpoint back, and the row must be updated. If the same browser is
// later used by a different person, the row follows them — which is correct,
// because the notification belongs to whoever is logged in there.
func (r *Repository) Upsert(ctx context.Context, userID uuid.UUID, in SubscribeRequest) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO staff_push_subs (user_id, endpoint, p256dh, auth, label)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (endpoint) DO UPDATE SET
		   user_id = EXCLUDED.user_id,
		   p256dh  = EXCLUDED.p256dh,
		   auth    = EXCLUDED.auth,
		   label   = EXCLUDED.label`,
		userID, in.Endpoint, in.P256dh, in.Auth, in.Label)
	if err != nil {
		return fmt.Errorf("upsert push sub: %w", err)
	}
	return nil
}

// List returns one person's registered browsers.
func (r *Repository) List(ctx context.Context, userID uuid.UUID) ([]Subscription, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, endpoint, label, last_used_at, created_at
		   FROM staff_push_subs WHERE user_id = $1 ORDER BY created_at`, userID)
	if err != nil {
		return nil, fmt.Errorf("list push subs: %w", err)
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.ID, &s.Endpoint, &s.Label, &s.LastUsedAt, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan push sub: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Delete removes one of a person's own browsers. Scoped to the owner so one
// operator cannot unsubscribe another.
func (r *Repository) Delete(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM staff_push_subs WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete push sub: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Recipients returns every subscription belonging to somebody who may handle
// chat. The permission is resolved here, in the query, so a person who loses
// the role stops being notified without anybody remembering to unsubscribe
// them.
func (r *Repository) Recipients(ctx context.Context, permission string) ([]subscription, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
		   FROM staff_push_subs s
		  WHERE EXISTS (
		        SELECT 1
		          FROM user_roles ur
		          JOIN role_permissions rp ON rp.role_id = ur.role_id
		          JOIN permissions p ON p.id = rp.permission_id
		         WHERE ur.user_id = s.user_id AND p.code IN ($1, '*'))`, permission)
	if err != nil {
		return nil, fmt.Errorf("push recipients: %w", err)
	}
	defer rows.Close()
	out := []subscription{}
	for rows.Next() {
		var s subscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Endpoint, &s.P256dh, &s.Auth); err != nil {
			return nil, fmt.Errorf("scan recipient: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MarkUsed records a successful delivery, so the console can show which
// browsers are still alive.
func (r *Repository) MarkUsed(ctx context.Context, ids []uuid.UUID) {
	if len(ids) == 0 {
		return
	}
	_, _ = r.pool.Exec(ctx,
		`UPDATE staff_push_subs SET last_used_at = now() WHERE id = ANY($1)`, ids)
}

// Prune drops subscriptions the push service has rejected for good.
func (r *Repository) Prune(ctx context.Context, ids []uuid.UUID) {
	if len(ids) == 0 {
		return
	}
	_, _ = r.pool.Exec(ctx, `DELETE FROM staff_push_subs WHERE id = ANY($1)`, ids)
}

// ClaimNotify answers "may I notify about this conversation now?" and records
// the answer in the same statement.
//
// One UPDATE rather than a read then a write: two API instances handling the
// same message must not both decide yes. The row is only touched when the
// window has passed, so the boolean the caller gets back is the decision.
func (r *Repository) ClaimNotify(ctx context.Context, convID uuid.UUID, window time.Duration) (bool, error) {
	var claimed bool
	err := r.pool.QueryRow(ctx,
		`UPDATE ai_conversations
		    SET last_notified_at = now()
		  WHERE id = $1
		    AND (last_notified_at IS NULL OR last_notified_at < now() - $2::interval)
		 RETURNING true`,
		convID, window.String()).Scan(&claimed)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // notified recently; nothing to do
	}
	if err != nil {
		return false, fmt.Errorf("claim notify: %w", err)
	}
	return claimed, nil
}

// Keys returns the stored VAPID pair, or an empty public key when the server
// has not generated one yet. The private half comes back still encrypted.
func (r *Repository) Keys(ctx context.Context) (string, []byte, error) {
	var pub string
	var priv []byte
	err := r.pool.QueryRow(ctx,
		`SELECT public_key, private_key FROM push_keys WHERE id`).Scan(&pub, &priv)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, fmt.Errorf("load push keys: %w", err)
	}
	return pub, priv, nil
}

// EnsureKeys stores a freshly generated pair, and returns whichever pair ends
// up being the stored one.
//
// The no-op DO UPDATE is what makes that true: two instances generating at the
// same moment both reach this statement, the first one's row wins, and the
// second gets the winner back instead of an error. Without it the loser would
// either fail or — far worse — overwrite a key browsers are already
// subscribed with.
func (r *Repository) EnsureKeys(ctx context.Context, pub string, priv []byte) (string, []byte, error) {
	var gotPub string
	var gotPriv []byte
	err := r.pool.QueryRow(ctx,
		`INSERT INTO push_keys (id, public_key, private_key) VALUES (true, $1, $2)
		 ON CONFLICT (id) DO UPDATE SET public_key = push_keys.public_key
		 RETURNING public_key, private_key`, pub, priv).Scan(&gotPub, &gotPriv)
	if err != nil {
		return "", nil, fmt.Errorf("store push keys: %w", err)
	}
	return gotPub, gotPriv, nil
}

// HasRecipients reports whether anybody on chat duty has a browser
// registered. It decides whether an out-of-hours visitor can be parked for a
// person at all: with nothing to ring, saying "nobody is on duty" is the
// honest answer.
func (r *Repository) HasRecipients(ctx context.Context, permission string) (bool, error) {
	var found bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM staff_push_subs s
		    WHERE EXISTS (
		          SELECT 1
		            FROM user_roles ur
		            JOIN role_permissions rp ON rp.role_id = ur.role_id
		            JOIN permissions p ON p.id = rp.permission_id
		           WHERE ur.user_id = s.user_id AND p.code IN ($1, '*')))`,
		permission).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("push has recipients: %w", err)
	}
	return found, nil
}
