package ai

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/httpx"
	"github.com/velt/backend/internal/modules/ai/conversation"
	"github.com/velt/backend/internal/modules/ai/tools"
	"github.com/velt/backend/internal/modules/crm/leads"
)

var (
	errInactiveUser = errors.New("ai/mcp: the account behind this token is not active")
	errNoIdentity   = errors.New("ai/mcp: no identity on this call")
)

// identityPort turns an MCP token's owner into the claims a tool call runs
// under.
//
// It reads roles and permissions live rather than freezing them into the token.
// That is the point of mapping a token to a person: taking someone's access
// away in the console takes their agent's access away at the next call, with no
// second place to remember.
type identityPort struct {
	pool *pgxpool.Pool
}

func (p identityPort) Claims(ctx context.Context, userID string) (*httpx.Identity, error) {
	id, err := uuid.Parse(userID)
	if err != nil {
		return nil, err
	}
	var status string
	if err := p.pool.QueryRow(ctx,
		`SELECT status FROM users WHERE id = $1`, id).Scan(&status); err != nil {
		return nil, err
	}
	if status != "active" {
		// A suspended account's agent is suspended too.
		return nil, errInactiveUser
	}

	rows, err := p.pool.Query(ctx, `
		SELECT DISTINCT p.code
		  FROM user_roles ur
		  JOIN role_permissions rp ON rp.role_id = ur.role_id
		  JOIN permissions p ON p.id = rp.permission_id
		 WHERE ur.user_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	perms := []string{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		perms = append(perms, code)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	roleRows, err := p.pool.Query(ctx, `
		SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()

	roles := []string{}
	for roleRows.Next() {
		var code string
		if err := roleRows.Scan(&code); err != nil {
			return nil, err
		}
		roles = append(roles, code)
	}
	return &httpx.Identity{UserID: id, Roles: roles, Permissions: perms}, roleRows.Err()
}

// pipelinePort adapts CRM for the agent-facing read tool.
//
// The caller's identity comes from the context on every call, not from a field
// captured at wiring time: these ports are built once and serve every agent, so
// a stored identity would be whoever happened to start the process.
type pipelinePort struct {
	list func(ctx context.Context, id *httpx.Identity, p leads.ListParams) (leads.ListResponse, error)
}

func (p pipelinePort) ListLeads(ctx context.Context, status string, limit int) ([]tools.LeadSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	id, ok := httpx.IdentityFromContext(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	res, err := p.list(ctx, id, leads.ListParams{Status: status, PageSize: limit, Page: 1})
	if err != nil {
		return nil, err
	}
	out := make([]tools.LeadSummary, 0, len(res.Items))
	for _, l := range res.Items {
		s := tools.LeadSummary{
			ID: l.ID.String(), Name: deref(l.Name), Email: deref(l.Email),
			Phone: deref(l.Phone), Zalo: deref(l.Zalo),
			Status: l.Status, Source: l.Source, Note: deref(l.Note),
			CreatedAt: l.CreatedAt.Format("2006-01-02"),
		}
		if l.Assignee != nil {
			s.Assignee = l.Assignee.FullName
		}
		for _, pr := range l.Products {
			s.Products = append(s.Products, pr.Name)
		}
		out = append(out, s)
	}
	return out, nil
}

// transcriptPort adapts the assistant's own history for the agent-facing tool.
type transcriptPort struct {
	read func(ctx context.Context, id *httpx.Identity, convID uuid.UUID) ([]conversation.MessageView, error)
}

func (p transcriptPort) Transcript(ctx context.Context, convID uuid.UUID) ([]tools.TranscriptLine, error) {
	id, ok := httpx.IdentityFromContext(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	rows, err := p.read(ctx, id, convID)
	if err != nil {
		return nil, err
	}
	out := make([]tools.TranscriptLine, 0, len(rows))
	for _, m := range rows {
		out = append(out, tools.TranscriptLine{
			Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt.Format("2006-01-02 15:04"),
		})
	}
	return out, nil
}
