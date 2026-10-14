package members

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository is the members persistence port. The service depends on this
// interface so it can be unit-tested against a fake.
type Repository interface {
	List(ctx context.Context, p ListParams) ([]Member, int, error)
	Get(ctx context.Context, id uuid.UUID) (*Member, error)
	GetBySlug(ctx context.Context, slug string) (*Member, error)
	Create(ctx context.Context, w write) (*Member, error)
	Update(ctx context.Context, id uuid.UUID, w write) (*Member, error)
	Delete(ctx context.Context, id uuid.UUID) error
	SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error)
	UpdateAvatarPath(ctx context.Context, id uuid.UUID, path *string) error
	Reorder(ctx context.Context, ids []uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed members repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

const memberColumns = `id, slug, full_name, role, bio, avatar_path, email, zalo,
	links, skills, sort_order, is_active, created_at, updated_at`

func scanMember(row pgx.Row) (*Member, error) {
	var m Member
	var links, skills []byte
	err := row.Scan(&m.ID, &m.Slug, &m.FullName, &m.Role, &m.Bio, &m.AvatarPath,
		&m.Email, &m.Zalo, &links, &skills, &m.SortOrder, &m.IsActive,
		&m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan member: %w", err)
	}
	// Both columns are NOT NULL DEFAULT '[]', so a decode failure means corrupt
	// data rather than an absent value — surface it instead of silently emptying.
	if err := json.Unmarshal(links, &m.Links); err != nil {
		return nil, fmt.Errorf("decode member links: %w", err)
	}
	if err := json.Unmarshal(skills, &m.Skills); err != nil {
		return nil, fmt.Errorf("decode member skills: %w", err)
	}
	if m.Links == nil {
		m.Links = []Link{}
	}
	if m.Skills == nil {
		m.Skills = []string{}
	}
	return &m, nil
}

func (r *pgxRepository) List(ctx context.Context, p ListParams) ([]Member, int, error) {
	var where []string
	var args []any
	if p.Query != "" {
		args = append(args, "%"+strings.ToLower(p.Query)+"%")
		where = append(where, fmt.Sprintf("(lower(full_name) LIKE $%d OR lower(slug) LIKE $%d)", len(args), len(args)))
	}
	if p.ActiveOnly {
		where = append(where, "is_active")
	}
	// CreatedTo is already midnight after the requested day, so < keeps that
	// whole day in range; see httpx.QueryDateRange.
	if p.CreatedFrom != nil {
		args = append(args, *p.CreatedFrom)
		where = append(where, fmt.Sprintf("created_at >= $%d", len(args)))
	}
	if p.CreatedTo != nil {
		args = append(args, *p.CreatedTo)
		where = append(where, fmt.Sprintf("created_at < $%d", len(args)))
	}
	clause := ""
	if len(where) > 0 {
		clause = " WHERE " + strings.Join(where, " AND ")
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM members`+clause, args...).Scan(&total); err != nil {
		return nil, 0, wrap("count members", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	q := fmt.Sprintf(`SELECT %s FROM members%s ORDER BY sort_order, full_name LIMIT $%d OFFSET $%d`,
		memberColumns, clause, len(args)-1, len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, wrap("list members", err)
	}
	defer rows.Close()

	items := make([]Member, 0, p.PageSize)
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *m)
	}
	return items, total, wrap("list members", rows.Err())
}

func (r *pgxRepository) Get(ctx context.Context, id uuid.UUID) (*Member, error) {
	return scanMember(r.pool.QueryRow(ctx, `SELECT `+memberColumns+` FROM members WHERE id = $1`, id))
}

func (r *pgxRepository) GetBySlug(ctx context.Context, slug string) (*Member, error) {
	return scanMember(r.pool.QueryRow(ctx, `SELECT `+memberColumns+` FROM members WHERE slug = $1`, slug))
}

func (r *pgxRepository) Create(ctx context.Context, w write) (*Member, error) {
	links, skills, err := encodeJSON(w)
	if err != nil {
		return nil, err
	}
	m, err := scanMember(r.pool.QueryRow(ctx,
		`INSERT INTO members (slug, full_name, role, bio, email, zalo, links, skills, sort_order, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
		         COALESCE($9, (SELECT COALESCE(max(sort_order), -1) + 1 FROM members)), $10)
		 RETURNING `+memberColumns,
		w.Slug, w.FullName, w.Role, w.Bio, w.Email, w.Zalo, links, skills, w.SortOrder, w.IsActive))
	if err != nil && isUniqueViolation(err) {
		return nil, ErrConflict
	}
	return m, err
}

func (r *pgxRepository) Update(ctx context.Context, id uuid.UUID, w write) (*Member, error) {
	links, skills, err := encodeJSON(w)
	if err != nil {
		return nil, err
	}
	m, err := scanMember(r.pool.QueryRow(ctx,
		`UPDATE members SET slug = $2, full_name = $3, role = $4, bio = $5, email = $6,
		        zalo = $7, links = $8, skills = $9, sort_order = $10, is_active = $11,
		        updated_at = now()
		 WHERE id = $1 RETURNING `+memberColumns,
		id, w.Slug, w.FullName, w.Role, w.Bio, w.Email, w.Zalo, links, skills, w.SortOrder, w.IsActive))
	if err != nil && isUniqueViolation(err) {
		return nil, ErrConflict
	}
	return m, err
}

func (r *pgxRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM members WHERE id = $1`, id)
	if err != nil {
		return wrap("delete member", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *pgxRepository) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM members WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2))`,
		slug, excludeID).Scan(&exists)
	return exists, wrap("member slug exists", err)
}

func (r *pgxRepository) UpdateAvatarPath(ctx context.Context, id uuid.UUID, path *string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE members SET avatar_path = $2, updated_at = now() WHERE id = $1`, id, path)
	if err != nil {
		return wrap("update member avatar", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reorder rewrites sort_order to match the given id order, in one statement so a
// partial failure cannot leave the roster half-sorted. Ids that no longer exist
// are ignored; rows not listed keep their current sort_order.
func (r *pgxRepository) Reorder(ctx context.Context, ids []uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE members m SET sort_order = o.ord, updated_at = now()
		 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
		 WHERE m.id = o.id`, ids)
	return wrap("reorder members", err)
}

// encodeJSON marshals the two JSONB-backed slices, normalising nil to an empty
// array so the column never receives SQL NULL (it is NOT NULL).
func encodeJSON(w write) (links, skills []byte, err error) {
	l := w.Links
	if l == nil {
		l = []Link{}
	}
	s := w.Skills
	if s == nil {
		s = []string{}
	}
	if links, err = json.Marshal(l); err != nil {
		return nil, nil, fmt.Errorf("encode member links: %w", err)
	}
	if skills, err = json.Marshal(s); err != nil {
		return nil, nil, fmt.Errorf("encode member skills: %w", err)
	}
	return links, skills, nil
}
