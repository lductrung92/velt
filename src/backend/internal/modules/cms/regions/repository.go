package regions

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository is the data-access contract for region blocks.
type Repository interface {
	AllBlocks(ctx context.Context) ([]blockRow, error)
	RegionBlocks(ctx context.Context, group, slot string) ([]blockRow, error)
	MenuExists(ctx context.Context, menuID uuid.UUID) (bool, error)
	ReplaceRegionBlocks(ctx context.Context, group, slot string, blocks []blockWrite) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed region block repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const blockColumns = `id, page_group, region, kind, widget_type, menu_id, config, is_visible`

func scanBlocks(rows pgx.Rows) ([]blockRow, error) {
	defer rows.Close()
	out := []blockRow{}
	for rows.Next() {
		var x blockRow
		if err := rows.Scan(&x.ID, &x.Group, &x.Region, &x.Kind, &x.WidgetType,
			&x.MenuID, &x.Config, &x.IsVisible); err != nil {
			return nil, fmt.Errorf("scan region block: %w", err)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (r *pgxRepository) AllBlocks(ctx context.Context) ([]blockRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+blockColumns+` FROM cms_region_blocks ORDER BY page_group, region, sort_order, id`)
	if err != nil {
		return nil, fmt.Errorf("list region blocks: %w", err)
	}
	return scanBlocks(rows)
}

func (r *pgxRepository) RegionBlocks(ctx context.Context, group, slot string) ([]blockRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+blockColumns+` FROM cms_region_blocks
		  WHERE page_group = $1 AND region = $2 ORDER BY sort_order, id`, group, slot)
	if err != nil {
		return nil, fmt.Errorf("region blocks: %w", err)
	}
	return scanBlocks(rows)
}

// MenuExists reports whether a menu block's target is still there. The write
// path asks before storing the id: the FK would catch a deleted menu, but not
// one that never existed, and either way a 422 naming the field beats a 500.
func (r *pgxRepository) MenuExists(ctx context.Context, menuID uuid.UUID) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM cms_menus WHERE id = $1)`, menuID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("menu exists: %w", err)
	}
	return ok, nil
}

// ReplaceRegionBlocks writes the whole content of one (group, slot) list in one
// transaction.
//
// A block the client sends back with its id KEEPS that id: it is updated in
// place, and only the blocks missing from the list are deleted. The same reason
// menus.ReplaceMenuItems works this way — a row's id is an anchor, and handing
// out a new one on every save silently orphans whatever is attached to it.
//
// An id that is not this list's is treated as absent and the block is inserted
// fresh, so a stray id cannot drag a block out of another group or slot.
func (r *pgxRepository) ReplaceRegionBlocks(ctx context.Context, group, slot string, blocks []blockWrite) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		keep := keptIDs(blocks)
		if _, e := tx.Exec(ctx,
			`DELETE FROM cms_region_blocks
			  WHERE page_group = $1 AND region = $2 AND NOT (id = ANY($3::uuid[]))`,
			group, slot, keep); e != nil {
			return e
		}
		return writeBlocks(ctx, tx, group, slot, blocks)
	})
}

// keptIDs collects the ids the client sent back.
func keptIDs(blocks []blockWrite) []uuid.UUID {
	out := []uuid.UUID{}
	for _, b := range blocks {
		if b.ID != nil {
			out = append(out, *b.ID)
		}
	}
	return out
}

func writeBlocks(ctx context.Context, tx pgx.Tx, group, slot string, blocks []blockWrite) error {
	for i, b := range blocks {
		var id uuid.UUID
		if b.ID != nil {
			err := tx.QueryRow(ctx, `
				UPDATE cms_region_blocks
				   SET kind = $4, widget_type = $5, menu_id = $6, config = $7,
				       sort_order = $8, is_visible = $9, updated_at = now()
				 WHERE id = $1 AND page_group = $2 AND region = $3
				 RETURNING id`,
				*b.ID, group, slot, b.Kind, b.WidgetType, b.MenuID, b.Config, i, b.IsVisible).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				err = nil
				id = uuid.Nil // not ours: fall through and insert it as new
			}
			if err != nil {
				return err
			}
		}
		if id == uuid.Nil {
			if err := tx.QueryRow(ctx, `
				INSERT INTO cms_region_blocks (page_group, region, kind, widget_type, menu_id, config, sort_order, is_visible)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
				group, slot, b.Kind, b.WidgetType, b.MenuID, b.Config, i, b.IsVisible).Scan(&id); err != nil {
				return err
			}
		}
	}
	return nil
}
