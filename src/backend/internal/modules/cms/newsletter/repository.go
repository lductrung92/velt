package newsletter

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Repository is the data-access contract for newsletter subscribers. One method
// = one query; no business rules here.
type Repository interface {
	ListSubscribers(ctx context.Context, p ListParams) ([]Subscriber, int, error)
	GetSubscriber(ctx context.Context, id uuid.UUID) (*Subscriber, error)
	DeleteSubscriber(ctx context.Context, id uuid.UUID) error
	Subscribe(ctx context.Context, email string, source, ip *string) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed newsletter repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const subscriberColumns = `id, email, source_key, confirmed_at, unsubscribed_at, created_at`

func scanSubscriber(row pgx.Row) (*Subscriber, error) {
	var s Subscriber
	err := row.Scan(&s.ID, &s.Email, &s.SourceKey, &s.ConfirmedAt, &s.UnsubscribedAt, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan subscriber: %w", err)
	}
	return &s, nil
}

func (r *pgxRepository) ListSubscribers(ctx context.Context, p ListParams) ([]Subscriber, int, error) {
	where := "1=1"
	switch p.Status {
	case StatusActive:
		where = "unsubscribed_at IS NULL"
	case StatusUnsubscribed:
		where = "unsubscribed_at IS NOT NULL"
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_newsletter_subscribers WHERE `+where).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count subscribers: %w", err)
	}
	rows, err := r.pool.Query(ctx, `SELECT `+subscriberColumns+`
		  FROM cms_newsletter_subscribers WHERE `+where+`
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, p.PageSize, (p.Page-1)*p.PageSize)
	if err != nil {
		return nil, 0, fmt.Errorf("list subscribers: %w", err)
	}
	defer rows.Close()
	out := []Subscriber{}
	for rows.Next() {
		var s Subscriber
		if err := rows.Scan(&s.ID, &s.Email, &s.SourceKey, &s.ConfirmedAt, &s.UnsubscribedAt, &s.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan subscriber row: %w", err)
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) GetSubscriber(ctx context.Context, id uuid.UUID) (*Subscriber, error) {
	return scanSubscriber(r.pool.QueryRow(ctx, `SELECT `+subscriberColumns+` FROM cms_newsletter_subscribers WHERE id = $1`, id))
}

func (r *pgxRepository) DeleteSubscriber(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_newsletter_subscribers WHERE id = $1`, id)
	return shared.Wrap("delete subscriber", err)
}

// Subscribe upserts an opt-in: idempotent on the unique email; re-subscribing
// clears a prior unsubscribe. Keeps the original source_key when one exists.
func (r *pgxRepository) Subscribe(ctx context.Context, email string, source, ip *string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO cms_newsletter_subscribers (email, source_key, ip_address)
		VALUES ($1, $2, $3)
		ON CONFLICT (email) DO UPDATE
		   SET unsubscribed_at = NULL,
		       source_key = COALESCE(cms_newsletter_subscribers.source_key, EXCLUDED.source_key)`,
		email, source, ip)
	return shared.Wrap("subscribe newsletter", err)
}
