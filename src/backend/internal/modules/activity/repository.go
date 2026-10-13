package activity

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const entryColumns = `id, occurred_at, action, entity, entity_id, entity_label,
	actor_id, actor_label, ip::text, correlation_id, metadata`

// Repository is the activity-log data access port.
type Repository interface {
	List(ctx context.Context, p ListParams) ([]Entry, int, error)
	Actions(ctx context.Context) ([]string, error)
}

type pgxRepository struct{ pool *pgxpool.Pool }

// NewRepository builds the Postgres-backed activity repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// List returns one page of the log, newest first.
//
// The filters offered are the ones migration 0039 indexed: actor_id, action and
// entity+entity_id each have their own index ending in occurred_at DESC, and the
// date range rides idx_activity_recent. Every one of them narrows before the
// sort, so the ORDER BY is free.
//
// Query (free text) is the exception and is deliberately the only one. It is an
// unanchored ILIKE over actor_label, entity_label and action, which no index can
// serve — on an append-only table that grows forever, left alone it is a
// sequential scan over the entire history on every keystroke. That is why the
// service clamps it to a date range (searchWindow) before it gets here: the
// scan then runs over the slice idx_activity_recent already selected, not over
// the table. metadata is excluded from the match on purpose — it is unindexed
// jsonb of arbitrary shape, and searching it would widen the scan again.
func (r *pgxRepository) List(ctx context.Context, p ListParams) ([]Entry, int, error) {
	conds := []string{"TRUE"}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}

	if p.ActorID != nil {
		add("actor_id = $%d", *p.ActorID)
	}
	if p.Action != "" {
		add("action = $%d", p.Action)
	}
	if p.Entity != "" {
		add("entity = $%d", p.Entity)
	}
	if p.EntityID != nil {
		add("entity_id = $%d", *p.EntityID)
	}
	if !p.From.IsZero() {
		add("occurred_at >= $%d", p.From)
	}
	if !p.To.IsZero() {
		add("occurred_at <= $%d", p.To)
	}
	if p.Query != "" {
		add(`(actor_label ILIKE '%%' || $%d || '%%'
		   OR coalesce(entity_label, '') ILIKE '%%' || $%[1]d || '%%'
		   OR action ILIKE '%%' || $%[1]d || '%%')`, p.Query)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM activity_log WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count activity: %w", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx,
		`SELECT `+entryColumns+` FROM activity_log WHERE `+where+
			` ORDER BY occurred_at DESC, id DESC`+
			fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list activity: %w", err)
	}
	defer rows.Close()

	out := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.OccurredAt, &e.Action, &e.Entity, &e.EntityID,
			&e.EntityLabel, &e.ActorID, &e.ActorLabel, &e.IP, &e.CorrelationID,
			&e.Metadata); err != nil {
			return nil, 0, fmt.Errorf("scan activity: %w", err)
		}
		out = append(out, e)
	}
	return out, total, rows.Err()
}

// Actions lists the distinct action codes present.
//
// A plain SELECT DISTINCT would read every entry of idx_activity_action to
// return the dozen or so codes that exist — cheap today, linear in the log's
// whole history forever after. This is the loose index scan: it jumps to the
// next larger code each time, so the cost is one index descent per distinct
// code rather than one per row.
func (r *pgxRepository) Actions(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		WITH RECURSIVE codes AS (
		    (SELECT action FROM activity_log ORDER BY action LIMIT 1)
		  UNION ALL
		    SELECT (SELECT a.action FROM activity_log a
		             WHERE a.action > c.action ORDER BY a.action LIMIT 1)
		      FROM codes c WHERE c.action IS NOT NULL
		)
		SELECT action FROM codes WHERE action IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("list activity actions: %w", err)
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, fmt.Errorf("scan activity action: %w", err)
		}
		out = append(out, code)
	}
	return out, rows.Err()
}
