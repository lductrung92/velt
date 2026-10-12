package pubdocs

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// ListParams narrows one page of published documents.
type ListParams struct {
	Entity string
	Locale string
	Query  string // free text, matched against search_text
	Sort   string // "newest" (default) | "oldest" | "title"
	// TitleField is the JSON key the "title" sort reads, because the entities do
	// not agree on one: articles have "title", products have "name".
	TitleField string
	Limit      int
	Offset     int
}

func (p ListParams) orderBy() string {
	switch p.Sort {
	case "oldest":
		return "published_at ASC"
	case "title":
		field := p.TitleField
		if field == "" {
			field = "title"
		}
		// The field name comes from the calling module's own code, never from a
		// request, but quote it anyway so a future caller cannot turn a typo into
		// an injection.
		return fmt.Sprintf("body ->> '%s' ASC", strings.ReplaceAll(field, "'", "''"))
	default:
		return "published_at DESC"
	}
}

// List returns one page of live documents plus the total match count.
//
// The free-text filter runs against search_text, which is indexed with pg_trgm,
// rather than against the body: digging into JSONB would mean a sequential scan,
// which is what the public search does today.
func (s *Store) List(ctx context.Context, p ListParams) ([]json.RawMessage, int, error) {
	conds := []string{"entity = $1", "locale = $2", "is_current", "body IS NOT NULL"}
	args := []any{p.Entity, p.Locale}
	if q := strings.TrimSpace(p.Query); q != "" {
		args = append(args, "%"+q+"%")
		conds = append(conds, fmt.Sprintf("search_text ILIKE $%d", len(args)))
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM published_docs WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("pubdocs count: %w", err)
	}
	if total == 0 {
		return []json.RawMessage{}, 0, nil
	}

	args = append(args, p.Limit, p.Offset)
	rows, err := s.pool.Query(ctx,
		`SELECT body FROM published_docs WHERE `+where+
			` ORDER BY `+p.orderBy()+
			fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("pubdocs list: %w", err)
	}
	defer rows.Close()

	out := []json.RawMessage{}
	for rows.Next() {
		var body json.RawMessage
		if err := rows.Scan(&body); err != nil {
			return nil, 0, fmt.Errorf("pubdocs scan body: %w", err)
		}
		out = append(out, body)
	}
	return out, total, rows.Err()
}
