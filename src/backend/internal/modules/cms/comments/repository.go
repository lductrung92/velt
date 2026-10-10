package comments

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/cms/shared"
)

// Repository is the data-access contract for comment moderation.
type Repository interface {
	List(ctx context.Context, p ListParams) ([]row, int, error)
	GetRow(ctx context.Context, id uuid.UUID) (*row, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status string) (*Comment, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type pgxRepository struct {
	pool *pgxpool.Pool
}

// NewRepository builds the pgx-backed comment repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

// columns is the RETURNING/scan column list for a Comment (no table alias).
const columns = `id, article_id, parent_id, author_name, status, approved_at, created_at`

func scanComment(r pgx.Row) (*Comment, error) {
	var c Comment
	err := r.Scan(&c.ID, &c.ArticleID, &c.ParentID, &c.AuthorName, &c.Status, &c.ApprovedAt, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan comment: %w", err)
	}
	return &c, nil
}

func (r *pgxRepository) List(ctx context.Context, p ListParams) ([]row, int, error) {
	conds := []string{"1=1"}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}
	if p.Status != "" {
		add("c.status = $%d", p.Status)
	}
	if p.ArticleID != nil {
		add("c.article_id = $%d", *p.ArticleID)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM cms_comments c WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count comments: %w", err)
	}
	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.article_id, a.title, c.parent_id, c.author_name, c.author_email,
		       host(c.ip_address), c.body, c.status, c.approved_at, c.created_at
		  FROM cms_comments c
		  JOIN cms_articles a ON a.id = c.article_id
		 WHERE `+where+`
		 ORDER BY c.created_at DESC, c.id DESC `+fmt.Sprintf("LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list comments: %w", err)
	}
	defer rows.Close()
	out := []row{}
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.ID, &x.ArticleID, &x.ArticleTitle, &x.ParentID, &x.AuthorName, &x.AuthorEmail,
			&x.IPAddress, &x.Body, &x.Status, &x.ApprovedAt, &x.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan comment row: %w", err)
		}
		out = append(out, x)
	}
	return out, total, rows.Err()
}

// GetRow returns the full moderation row (with article title + PII) for a single
// comment — used for the 404 check and the PATCH response.
func (r *pgxRepository) GetRow(ctx context.Context, id uuid.UUID) (*row, error) {
	var x row
	err := r.pool.QueryRow(ctx, `
		SELECT c.id, c.article_id, a.title, c.parent_id, c.author_name, c.author_email,
		       host(c.ip_address), c.body, c.status, c.approved_at, c.created_at
		  FROM cms_comments c
		  JOIN cms_articles a ON a.id = c.article_id
		 WHERE c.id = $1`, id).Scan(&x.ID, &x.ArticleID, &x.ArticleTitle, &x.ParentID, &x.AuthorName,
		&x.AuthorEmail, &x.IPAddress, &x.Body, &x.Status, &x.ApprovedAt, &x.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get comment row: %w", err)
	}
	return &x, nil
}

// UpdateStatus sets the moderation status; approved_at is now() when the status
// becomes approved, else cleared.
func (r *pgxRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) (*Comment, error) {
	return scanComment(r.pool.QueryRow(ctx, `
		UPDATE cms_comments
		   SET status = $2,
		       approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END
		 WHERE id = $1
		RETURNING `+columns, id, status))
}

func (r *pgxRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM cms_comments WHERE id = $1`, id) // children cascade
	return shared.Wrap("delete comment", err)
}
