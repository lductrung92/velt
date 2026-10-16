package catalog

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/products/shared"
)

// LinksRepository is the persistence port for everything that hangs off a
// product: its categories, its people, and its gallery. Kept separate from
// Repository so the product-row fake in the unit tests stays small.
type LinksRepository interface {
	Categories(ctx context.Context, productID uuid.UUID) ([]CategoryRef, error)
	SetCategories(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error

	Members(ctx context.Context, productID uuid.UUID) ([]MemberRef, error)
	SetMembers(ctx context.Context, productID uuid.UUID, links []MemberLinkInput) error

	Media(ctx context.Context, productID uuid.UUID) ([]MediaItem, error)
	AddMedia(ctx context.Context, productID uuid.UUID, kind string, path, videoURL, caption *string) (*MediaItem, error)
	UpdateMediaCaption(ctx context.Context, productID, mediaID uuid.UUID, caption *string) (*MediaItem, error)
	DeleteMedia(ctx context.Context, productID, mediaID uuid.UUID) (*MediaItem, error)
	ReorderMedia(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error
}

type pgxLinksRepository struct {
	pool *pgxpool.Pool
}

// NewLinksRepository builds the pgx-backed links repository.
func NewLinksRepository(pool *pgxpool.Pool) LinksRepository {
	return &pgxLinksRepository{pool: pool}
}

// --- Categories ---

func (r *pgxLinksRepository) Categories(ctx context.Context, productID uuid.UUID) ([]CategoryRef, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.id, c.slug, c.name
		 FROM product_category_links l
		 JOIN product_categories c ON c.id = l.category_id
		 WHERE l.product_id = $1
		 ORDER BY c.sort_order, c.name`, productID)
	if err != nil {
		return nil, shared.Wrap("list product categories", err)
	}
	defer rows.Close()

	out := make([]CategoryRef, 0, 4)
	for rows.Next() {
		var c CategoryRef
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name); err != nil {
			return nil, shared.Wrap("scan product category", err)
		}
		out = append(out, c)
	}
	return out, shared.Wrap("list product categories", rows.Err())
}

// SetCategories replaces the whole set in one transaction: a half-applied
// change would leave the product in a grouping nobody chose.
func (r *pgxLinksRepository) SetCategories(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return shared.Wrap("set categories: begin", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM product_category_links WHERE product_id = $1`, productID); err != nil {
		return shared.Wrap("set categories: clear", err)
	}
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx,
			`INSERT INTO product_category_links (product_id, category_id)
			 SELECT $1, id FROM unnest($2::uuid[]) AS id`, productID, ids); err != nil {
			// A missing category id is the client naming a row that is not there.
			if shared.IsForeignKeyViolation(err) {
				return shared.ErrLinkTargetMissing
			}
			return shared.Wrap("set categories: insert", err)
		}
	}
	return shared.Wrap("set categories: commit", tx.Commit(ctx))
}

// --- Members ---

func (r *pgxLinksRepository) Members(ctx context.Context, productID uuid.UUID) ([]MemberRef, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT m.id, m.slug, m.full_name, COALESCE(m.display_name, ''),
		        pm.role, m.avatar_path, pm.sort_order
		 FROM product_members pm
		 JOIN members m ON m.id = pm.member_id
		 WHERE pm.product_id = $1
		 ORDER BY pm.sort_order, m.full_name`, productID)
	if err != nil {
		return nil, shared.Wrap("list product members", err)
	}
	defer rows.Close()

	out := make([]MemberRef, 0, 4)
	for rows.Next() {
		var m MemberRef
		if err := rows.Scan(&m.ID, &m.Slug, &m.FullName, &m.DisplayName,
			&m.Role, &m.avatarPath, &m.SortOrder); err != nil {
			return nil, shared.Wrap("scan product member", err)
		}
		out = append(out, m)
	}
	return out, shared.Wrap("list product members", rows.Err())
}

// SetMembers replaces the whole list in one transaction. Position in the slice
// becomes sort_order, so the client expresses order by ordering the array.
func (r *pgxLinksRepository) SetMembers(ctx context.Context, productID uuid.UUID, links []MemberLinkInput) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return shared.Wrap("set members: begin", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM product_members WHERE product_id = $1`, productID); err != nil {
		return shared.Wrap("set members: clear", err)
	}
	for i, l := range links {
		if _, err := tx.Exec(ctx,
			`INSERT INTO product_members (product_id, member_id, role, sort_order)
			 VALUES ($1, $2, $3, $4)`, productID, l.MemberID, l.Role, i); err != nil {
			if shared.IsForeignKeyViolation(err) {
				return shared.ErrLinkTargetMissing
			}
			return shared.Wrap("set members: insert", err)
		}
	}
	return shared.Wrap("set members: commit", tx.Commit(ctx))
}

// --- Gallery ---

const mediaColumns = `id, kind, path, video_url, caption, sort_order, created_at`

func scanMedia(row pgx.Row) (*MediaItem, error) {
	var m MediaItem
	err := row.Scan(&m.ID, &m.Kind, &m.path, &m.VideoURL, &m.Caption, &m.SortOrder, &m.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, shared.Wrap("scan product media", err)
	}
	return &m, nil
}

func (r *pgxLinksRepository) Media(ctx context.Context, productID uuid.UUID) ([]MediaItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+mediaColumns+` FROM product_media WHERE product_id = $1 ORDER BY sort_order, created_at`,
		productID)
	if err != nil {
		return nil, shared.Wrap("list product media", err)
	}
	defer rows.Close()

	out := make([]MediaItem, 0, 8)
	for rows.Next() {
		m, err := scanMedia(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, shared.Wrap("list product media", rows.Err())
}

func (r *pgxLinksRepository) AddMedia(ctx context.Context, productID uuid.UUID, kind string, path, videoURL, caption *string) (*MediaItem, error) {
	return scanMedia(r.pool.QueryRow(ctx,
		`INSERT INTO product_media (product_id, kind, path, video_url, caption, sort_order)
		 VALUES ($1, $2, $3, $4, $5,
		         (SELECT COALESCE(max(sort_order), -1) + 1 FROM product_media WHERE product_id = $1))
		 RETURNING `+mediaColumns,
		productID, kind, path, videoURL, caption))
}

// UpdateMediaCaption scopes the update by product_id as well as media id, so a
// caption cannot be edited through a product the caller does not hold.
func (r *pgxLinksRepository) UpdateMediaCaption(ctx context.Context, productID, mediaID uuid.UUID, caption *string) (*MediaItem, error) {
	return scanMedia(r.pool.QueryRow(ctx,
		`UPDATE product_media SET caption = $3 WHERE product_id = $1 AND id = $2
		 RETURNING `+mediaColumns, productID, mediaID, caption))
}

// DeleteMedia returns the removed row so the service can reclaim its file.
func (r *pgxLinksRepository) DeleteMedia(ctx context.Context, productID, mediaID uuid.UUID) (*MediaItem, error) {
	return scanMedia(r.pool.QueryRow(ctx,
		`DELETE FROM product_media WHERE product_id = $1 AND id = $2
		 RETURNING `+mediaColumns, productID, mediaID))
}

// ReorderMedia rewrites sort_order to match the given id order in one
// statement, scoped to the product so ids from elsewhere are ignored.
func (r *pgxLinksRepository) ReorderMedia(ctx context.Context, productID uuid.UUID, ids []uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE product_media m SET sort_order = o.ord
		 FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
		 WHERE m.id = o.id AND m.product_id = $1`, productID, ids)
	return shared.Wrap("reorder product media", err)
}
