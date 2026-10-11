package leads

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/crm/shared"
)

// leadsReachable is the DB constraint name; the service turns a violation of it
// into a field error rather than a 500.
const leadsReachable = "leads_reachable"

const leadColumns = `id, name, email, phone, zalo,
	source, conversation_id, assigned_member_id, status, note,
	created_at, updated_at`

// Repository is the leads data access port.
type Repository interface {
	List(ctx context.Context, p ListParams) ([]*Lead, int, error)
	Get(ctx context.Context, id uuid.UUID) (*Lead, error)
	Create(ctx context.Context, w write, productIDs []uuid.UUID) (*Lead, error)
	Update(ctx context.Context, id uuid.UUID, w write, productIDs []uuid.UUID, setProducts bool) (*Lead, error)
	Delete(ctx context.Context, id uuid.UUID) error
	ProductsOf(ctx context.Context, leadID uuid.UUID) ([]ProductRef, error)
	AssigneeOf(ctx context.Context, memberID uuid.UUID) (*MemberRef, error)
}

type pgxRepository struct{ pool *pgxpool.Pool }

// NewRepository builds the Postgres-backed leads repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func scanLead(row pgx.Row) (*Lead, error) {
	var l Lead
	err := row.Scan(&l.ID, &l.Name, &l.Email, &l.Phone, &l.Zalo,
		&l.Source, &l.ConversationID, &l.AssignedMemberID, &l.Status, &l.Note,
		&l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, shared.ErrNotFound
		}
		return nil, err
	}
	return &l, nil
}

func (r *pgxRepository) List(ctx context.Context, p ListParams) ([]*Lead, int, error) {
	conds := []string{"1=1"}
	args := []any{}
	add := func(tmpl string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(tmpl, len(args)))
	}

	if p.Query != "" {
		add(`(coalesce(name,'') ILIKE '%%' || $%d || '%%'
		   OR coalesce(email,'') ILIKE '%%' || $%[1]d || '%%'
		   OR coalesce(phone,'') ILIKE '%%' || $%[1]d || '%%'
		   OR coalesce(zalo,'')  ILIKE '%%' || $%[1]d || '%%')`, p.Query)
	}
	if p.Status != "" {
		add("status = $%d", p.Status)
	}
	if p.Source != "" {
		add("source = $%d", p.Source)
	}
	switch {
	case p.Assignee == "unassigned":
		conds = append(conds, "assigned_member_id IS NULL")
	case p.Assignee != "":
		add("assigned_member_id = $%d", p.Assignee)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM leads WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, shared.Wrap("count leads", err)
	}

	args = append(args, p.PageSize, (p.Page-1)*p.PageSize)
	rows, err := r.pool.Query(ctx,
		`SELECT `+leadColumns+` FROM leads WHERE `+where+
			` ORDER BY created_at DESC, id DESC`+
			fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, shared.Wrap("list leads", err)
	}
	defer rows.Close()

	out := []*Lead{}
	for rows.Next() {
		l, err := scanLead(rows)
		if err != nil {
			return nil, 0, shared.Wrap("scan lead", err)
		}
		out = append(out, l)
	}
	return out, total, rows.Err()
}

func (r *pgxRepository) Get(ctx context.Context, id uuid.UUID) (*Lead, error) {
	return scanLead(r.pool.QueryRow(ctx, `SELECT `+leadColumns+` FROM leads WHERE id = $1`, id))
}

// Create inserts the lead and its product links in one transaction: a lead that
// half-exists is worse than one that does not.
func (r *pgxRepository) Create(ctx context.Context, w write, productIDs []uuid.UUID) (*Lead, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, shared.Wrap("create lead: begin", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	l, err := scanLead(tx.QueryRow(ctx, `
		INSERT INTO leads (name, email, phone, zalo, source, conversation_id,
		                   assigned_member_id, status, note)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING `+leadColumns,
		w.Name, w.Email, w.Phone, w.Zalo, w.Source, w.ConversationID,
		w.AssignedMemberID, w.Status, w.Note))
	if err != nil {
		return nil, classify("create lead", err)
	}
	if err := replaceProducts(ctx, tx, l.ID, productIDs); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, shared.Wrap("create lead: commit", err)
	}
	return l, nil
}

// Update rewrites the row. setProducts tells links apart from "not mentioned":
// a PATCH that omits product_ids must leave the existing links alone.
func (r *pgxRepository) Update(ctx context.Context, id uuid.UUID, w write,
	productIDs []uuid.UUID, setProducts bool,
) (*Lead, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, shared.Wrap("update lead: begin", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	l, err := scanLead(tx.QueryRow(ctx, `
		UPDATE leads SET name=$2, email=$3, phone=$4, zalo=$5,
		                 assigned_member_id=$6, status=$7, note=$8, updated_at=now()
		 WHERE id = $1
		RETURNING `+leadColumns,
		id, w.Name, w.Email, w.Phone, w.Zalo, w.AssignedMemberID, w.Status, w.Note))
	if err != nil {
		return nil, classify("update lead", err)
	}
	if setProducts {
		if err := replaceProducts(ctx, tx, id, productIDs); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, shared.Wrap("update lead: commit", err)
	}
	return l, nil
}

func (r *pgxRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM leads WHERE id = $1`, id) // links cascade
	if err != nil {
		return shared.Wrap("delete lead", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}

func (r *pgxRepository) ProductsOf(ctx context.Context, leadID uuid.UUID) ([]ProductRef, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.slug, p.name
		  FROM lead_products lp JOIN products p ON p.id = lp.product_id
		 WHERE lp.lead_id = $1
		 ORDER BY p.name`, leadID)
	if err != nil {
		return nil, shared.Wrap("lead products", err)
	}
	defer rows.Close()

	out := []ProductRef{}
	for rows.Next() {
		var p ProductRef
		if err := rows.Scan(&p.ID, &p.Slug, &p.Name); err != nil {
			return nil, shared.Wrap("scan lead product", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *pgxRepository) AssigneeOf(ctx context.Context, memberID uuid.UUID) (*MemberRef, error) {
	var m MemberRef
	err := r.pool.QueryRow(ctx,
		`SELECT id, slug, full_name FROM members WHERE id = $1`, memberID).
		Scan(&m.ID, &m.Slug, &m.FullName)
	if err != nil {
		if err == pgx.ErrNoRows {
			// The member was deleted; the FK already nulled the column, so this
			// is a race, not corruption. Render the lead without an assignee.
			return nil, nil
		}
		return nil, shared.Wrap("lead assignee", err)
	}
	return &m, nil
}

// replaceProducts swaps the whole link set. De-duplicates: asking about the
// same product twice means asking once.
func replaceProducts(ctx context.Context, tx pgx.Tx, leadID uuid.UUID, ids []uuid.UUID) error {
	if _, err := tx.Exec(ctx, `DELETE FROM lead_products WHERE lead_id = $1`, leadID); err != nil {
		return shared.Wrap("clear lead products", err)
	}
	seen := map[uuid.UUID]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if _, err := tx.Exec(ctx,
			`INSERT INTO lead_products (lead_id, product_id) VALUES ($1, $2)`, leadID, id); err != nil {
			return classify("link lead product", err)
		}
	}
	return nil
}

// classify turns the two constraint violations the client can actually cause
// into sentinels, so they surface as 422 rather than 500.
func classify(op string, err error) error {
	switch {
	case shared.IsCheckViolation(err, leadsReachable):
		return shared.ErrUnreachable
	case shared.IsForeignKeyViolation(err):
		return shared.ErrLinkTargetMissing
	default:
		return shared.Wrap(op, err)
	}
}
