package menus

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Repository is the data-access contract for menu slots + item trees.
type Repository interface {
	ListMenus(ctx context.Context) ([]Menu, error)
	GetMenu(ctx context.Context, id uuid.UUID) (*Menu, error)
	CreateMenu(ctx context.Context, name, location string) (*Menu, error)
	UpdateMenu(ctx context.Context, id uuid.UUID, name, location string) (*Menu, error)
	DeleteMenu(ctx context.Context, id uuid.UUID) error
	MenuItems(ctx context.Context, menuID uuid.UUID) ([]itemRow, error)
	ItemExists(ctx context.Context, itemID uuid.UUID) (bool, error)
	ReplaceMenuItems(ctx context.Context, menuID uuid.UUID, items []itemWrite) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed menu repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const menuColumns = `id, name, location, created_at, updated_at`

func scanMenu(row pgx.Row) (*Menu, error) {
	var m Menu
	err := row.Scan(&m.ID, &m.Name, &m.Location, &m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan menu: %w", err)
	}
	return &m, nil
}

func (r *pgxRepository) ListMenus(ctx context.Context) ([]Menu, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+menuColumns+` FROM cms_menus ORDER BY location`)
	if err != nil {
		return nil, fmt.Errorf("list menus: %w", err)
	}
	defer rows.Close()
	out := []Menu{}
	for rows.Next() {
		var m Menu
		if err := rows.Scan(&m.ID, &m.Name, &m.Location, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan menu row: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *pgxRepository) GetMenu(ctx context.Context, id uuid.UUID) (*Menu, error) {
	return scanMenu(r.pool.QueryRow(ctx, `SELECT `+menuColumns+` FROM cms_menus WHERE id = $1`, id))
}

func (r *pgxRepository) CreateMenu(ctx context.Context, name, location string) (*Menu, error) {
	return scanMenu(r.pool.QueryRow(ctx,
		`INSERT INTO cms_menus (name, location) VALUES ($1, $2) RETURNING `+menuColumns, name, location))
}

func (r *pgxRepository) UpdateMenu(ctx context.Context, id uuid.UUID, name, location string) (*Menu, error) {
	return scanMenu(r.pool.QueryRow(ctx,
		`UPDATE cms_menus SET name=$2, location=$3, updated_at=now() WHERE id=$1 RETURNING `+menuColumns,
		id, name, location))
}

func (r *pgxRepository) DeleteMenu(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_menus WHERE id = $1`, id) // items cascade
	return shared.Wrap("delete menu", err)
}

func (r *pgxRepository) MenuItems(ctx context.Context, menuID uuid.UUID) ([]itemRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, parent_id, label, description, link_type, target_id, url, open_new_tab, sort_order
		  FROM cms_menu_items WHERE menu_id = $1 ORDER BY sort_order, id`, menuID)
	if err != nil {
		return nil, fmt.Errorf("menu items: %w", err)
	}
	defer rows.Close()
	out := []itemRow{}
	for rows.Next() {
		var x itemRow
		if err := rows.Scan(&x.ID, &x.ParentID, &x.Label, &x.Description, &x.LinkType,
			&x.TargetID, &x.URL, &x.OpenNewTab, &x.SortOrder); err != nil {
			return nil, fmt.Errorf("scan menu item: %w", err)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// ReplaceMenuItems writes the whole item tree of a menu in one transaction.
//
// An item the client sends back with its id KEEPS that id: it is updated in
// place, and only the items missing from the tree are deleted. The tree used to
// be deleted and re-inserted wholesale, which gave every item a new id on every
// save — fine while nothing referred to an item, and fatal the moment something
// did: a translated label is stored against the item's id, and would have been
// orphaned by the next Save of the menu it belongs to.
//
// An id that is not this menu's is treated as absent and the item is inserted
// fresh, so a stray id cannot reach across menus.
func (r *pgxRepository) ReplaceMenuItems(ctx context.Context, menuID uuid.UUID, items []itemWrite) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		keep := keptIDs(items)
		if _, e := tx.Exec(ctx,
			`DELETE FROM cms_menu_items WHERE menu_id = $1 AND NOT (id = ANY($2::uuid[]))`,
			menuID, keep); e != nil {
			return e
		}
		// The slot's updated_at is what the public cache version watches: the
		// items themselves carry no timestamp, so editing a label would be
		// invisible to the site's cache if this were left out.
		if _, e := tx.Exec(ctx, `UPDATE cms_menus SET updated_at = now() WHERE id = $1`, menuID); e != nil {
			return e
		}
		return writeItems(ctx, tx, menuID, nil, items)
	})
}

// keptIDs collects the ids the client sent back, at every depth.
func keptIDs(items []itemWrite) []uuid.UUID {
	out := []uuid.UUID{}
	var walk func(list []itemWrite)
	walk = func(list []itemWrite) {
		for _, it := range list {
			if it.ID != nil {
				out = append(out, *it.ID)
			}
			walk(it.Children)
		}
	}
	walk(items)
	return out
}

func writeItems(ctx context.Context, tx pgx.Tx, menuID uuid.UUID, parentID *uuid.UUID, items []itemWrite) error {
	for i, it := range items {
		var id uuid.UUID
		var err error
		if it.ID != nil {
			err = tx.QueryRow(ctx, `
				UPDATE cms_menu_items
				   SET parent_id = $3, label = $4, description = $5, link_type = $6,
				       target_id = $7, url = $8, open_new_tab = $9, sort_order = $10
				 WHERE id = $1 AND menu_id = $2
				 RETURNING id`,
				*it.ID, menuID, parentID, it.Label, it.Description, it.LinkType,
				it.TargetID, it.URL, it.OpenNewTab, i).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				err = nil
				id = uuid.Nil // not ours: fall through and insert it as new
			}
			if err != nil {
				return err
			}
		}
		if id == uuid.Nil {
			err = tx.QueryRow(ctx, `
				INSERT INTO cms_menu_items (menu_id, parent_id, label, description, link_type, target_id, url, open_new_tab, sort_order)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
				menuID, parentID, it.Label, it.Description, it.LinkType, it.TargetID, it.URL, it.OpenNewTab, i).Scan(&id)
			if err != nil {
				return err
			}
		}
		if len(it.Children) > 0 {
			if err := writeItems(ctx, tx, menuID, &id, it.Children); err != nil {
				return err
			}
		}
	}
	return nil
}

// ItemExists reports whether one menu item is still there. The translation gate
// asks before storing text against an id, so a mistyped one cannot leave a row
// belonging to nothing — no delete path would ever reach it.
func (r *pgxRepository) ItemExists(ctx context.Context, itemID uuid.UUID) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM cms_menu_items WHERE id = $1)`, itemID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("menu item exists: %w", err)
	}
	return ok, nil
}
