package conversation

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velt/backend/internal/modules/ai/shared"
)

const convColumns = `id, state, visitor_key, referrer_member_id, lead_id,
	claimed_by_user_id, claimed_at, turn_count, last_activity_at, created_at`

// Repository is the conversation data-access port.
type Repository interface {
	Create(ctx context.Context, visitorKey string, referrerMemberID *uuid.UUID) (*Conversation, error)
	Get(ctx context.Context, id uuid.UUID) (*Conversation, error)
	// ActiveByVisitor finds the thread this visitor is still in, so reopening
	// the widget or reloading the page lands back in it instead of starting a
	// fresh one. Closed threads are not returned: those are finished.
	ActiveByVisitor(ctx context.Context, visitorKey string) (*Conversation, error)
	// BumpTurn increments the turn counter and touches last_activity_at in one
	// statement, returning the new count so the caller can enforce the ceiling
	// without a read-then-write race.
	BumpTurn(ctx context.Context, id uuid.UUID) (int, error)
	SetState(ctx context.Context, id uuid.UUID, state string) error
	// AttachLead links a lead to the conversation, but only if there is not one
	// already — the guard that stops a looping model filing the same person
	// twice. Reports whether a lead was already attached.
	AttachLead(ctx context.Context, id, leadID uuid.UUID) (alreadyHad bool, err error)
	AddMessage(ctx context.Context, m Message) (*Message, error)
	History(ctx context.Context, id uuid.UUID, limit int) ([]Message, error)
	MemberBySlug(ctx context.Context, slug string) (*uuid.UUID, string, error)
	// Inbox lists conversations for the console, newest activity first.
	Inbox(ctx context.Context, state string, limit int) ([]InboxRow, error)
	// Claim takes a conversation for a user, but only if nobody else already
	// has it. Reports false when someone beat the caller to it.
	Claim(ctx context.Context, id, userID uuid.UUID) (won bool, err error)
	// Release hands it back to the assistant.
	Release(ctx context.Context, id uuid.UUID) error
	// AddUsage rolls today's token spend forward.
	AddUsage(ctx context.Context, in, out int) error
	// UsageToday returns output tokens spent today, for the budget guard.
	UsageToday(ctx context.Context) (int, error)
	// UsageRange returns the last n days of spend, newest first, for the
	// console. A budget nobody can see is not a budget.
	UsageRange(ctx context.Context, days int) ([]UsageDay, error)
}

type pgxRepository struct{ pool *pgxpool.Pool }

// NewRepository builds the Postgres-backed conversation repository.
func NewRepository(pool *pgxpool.Pool) Repository { return &pgxRepository{pool: pool} }

func scanConv(row pgx.Row) (*Conversation, error) {
	var c Conversation
	err := row.Scan(&c.ID, &c.State, &c.VisitorKey, &c.ReferrerMemberID, &c.LeadID,
		&c.ClaimedByUserID, &c.ClaimedAt, &c.TurnCount, &c.LastActivityAt, &c.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, shared.ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// A visitor can have several rows over time; the newest active one is theirs.
// Ordering by last_activity_at rather than created_at means a thread they came
// back to wins over a newer one they abandoned.
func (r *pgxRepository) ActiveByVisitor(ctx context.Context, visitorKey string) (*Conversation, error) {
	c, err := scanConv(r.pool.QueryRow(ctx,
		`SELECT `+convColumns+` FROM ai_conversations
		 WHERE visitor_key = $1 AND state <> $2
		 ORDER BY last_activity_at DESC NULLS LAST, created_at DESC
		 LIMIT 1`, visitorKey, StateClosed))
	if err != nil {
		return nil, shared.Wrap("active conversation by visitor", err)
	}
	return c, nil
}

func (r *pgxRepository) Create(ctx context.Context, visitorKey string, referrer *uuid.UUID) (*Conversation, error) {
	c, err := scanConv(r.pool.QueryRow(ctx,
		`INSERT INTO ai_conversations (visitor_key, referrer_member_id)
		 VALUES ($1, $2) RETURNING `+convColumns, visitorKey, referrer))
	if err != nil {
		return nil, shared.Wrap("create conversation", err)
	}
	// Counted on creation rather than on first message: the interesting number
	// is how many people opened the chat at all.
	_, _ = r.pool.Exec(ctx, `
		INSERT INTO ai_usage_daily (day, conversations) VALUES (CURRENT_DATE, 1)
		ON CONFLICT (day) DO UPDATE SET conversations = ai_usage_daily.conversations + 1`)
	return c, nil
}

func (r *pgxRepository) Get(ctx context.Context, id uuid.UUID) (*Conversation, error) {
	c, err := scanConv(r.pool.QueryRow(ctx,
		`SELECT `+convColumns+` FROM ai_conversations WHERE id = $1`, id))
	if err != nil {
		if err == shared.ErrNotFound {
			return nil, err
		}
		return nil, shared.Wrap("get conversation", err)
	}
	return c, nil
}

func (r *pgxRepository) BumpTurn(ctx context.Context, id uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		UPDATE ai_conversations
		   SET turn_count = turn_count + 1, last_activity_at = now()
		 WHERE id = $1
		RETURNING turn_count`, id).Scan(&n)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, shared.ErrNotFound
		}
		return 0, shared.Wrap("bump turn", err)
	}
	return n, nil
}

func (r *pgxRepository) SetState(ctx context.Context, id uuid.UUID, state string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE ai_conversations SET state = $2, last_activity_at = now() WHERE id = $1`,
		id, state)
	if err != nil {
		return shared.Wrap("set state", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}

func (r *pgxRepository) AttachLead(ctx context.Context, id, leadID uuid.UUID) (bool, error) {
	// One statement: the WHERE clause is the lock. Two concurrent tool calls
	// cannot both see "no lead yet" and both win.
	tag, err := r.pool.Exec(ctx,
		`UPDATE ai_conversations SET lead_id = $2 WHERE id = $1 AND lead_id IS NULL`, id, leadID)
	if err != nil {
		return false, shared.Wrap("attach lead", err)
	}
	return tag.RowsAffected() == 0, nil
}

func (r *pgxRepository) AddMessage(ctx context.Context, m Message) (*Message, error) {
	var out Message
	err := r.pool.QueryRow(ctx, `
		INSERT INTO ai_messages (conversation_id, role, author_user_id, content, token_in, token_out)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, conversation_id, role, author_user_id, content, token_in, token_out, created_at`,
		m.ConversationID, m.Role, m.AuthorUserID, m.Content, m.TokenIn, m.TokenOut).
		Scan(&out.ID, &out.ConversationID, &out.Role, &out.AuthorUserID, &out.Content,
			&out.TokenIn, &out.TokenOut, &out.CreatedAt)
	if err != nil {
		return nil, shared.Wrap("add message", err)
	}
	return &out, nil
}

// History returns the last `limit` messages in chronological order. The window
// is bounded because the whole transcript goes into the next prompt.
func (r *pgxRepository) History(ctx context.Context, id uuid.UUID, limit int) ([]Message, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, conversation_id, role, author_user_id, content, token_in, token_out, created_at
		  FROM (
		    SELECT * FROM ai_messages WHERE conversation_id = $1
		     ORDER BY created_at DESC, id DESC LIMIT $2
		  ) t
		 ORDER BY created_at, id`, id, limit)
	if err != nil {
		return nil, shared.Wrap("conversation history", err)
	}
	defer rows.Close()

	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Role, &m.AuthorUserID,
			&m.Content, &m.TokenIn, &m.TokenOut, &m.CreatedAt); err != nil {
			return nil, shared.Wrap("scan message", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MemberBySlug resolves a ?ref= slug to an active member.
//
// The name is the PUBLIC one: it goes straight into the greeting a visitor
// reads ("Mot thanh vien cua Zukatek..."), so it must be display_name, with
// the same fallback to full_name the roster uses. See migration 0051.
func (r *pgxRepository) MemberBySlug(ctx context.Context, slug string) (*uuid.UUID, string, error) {
	var id uuid.UUID
	var name string
	err := r.pool.QueryRow(ctx,
		`SELECT id, COALESCE(display_name, full_name)
		   FROM members WHERE slug = $1 AND is_active = true`, slug).
		Scan(&id, &name)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, "", shared.ErrNotFound
		}
		return nil, "", shared.Wrap("member by slug", err)
	}
	return &id, name, nil
}

// InboxRow is a conversation as the console inbox lists it.
type InboxRow struct {
	Conversation
	LastMessage  *string
	LastRole     *string
	MessageCount int
}

func (r *pgxRepository) Inbox(ctx context.Context, state string, limit int) ([]InboxRow, error) {
	where := `state <> 'closed'`
	args := []any{limit}
	if state != "" {
		where = `state = $2`
		args = append(args, state)
	}
	// The preview comes from a lateral join rather than a second round trip per
	// row: an inbox that needs N+1 queries gets slow exactly when it is busy.
	rows, err := r.pool.Query(ctx, `
		SELECT `+convColumns+`, m.content, m.role,
		       (SELECT count(*) FROM ai_messages x WHERE x.conversation_id = c.id)
		  FROM ai_conversations c
		  LEFT JOIN LATERAL (
		      SELECT content, role FROM ai_messages
		       WHERE conversation_id = c.id
		       ORDER BY created_at DESC, id DESC LIMIT 1
		  ) m ON true
		 WHERE `+where+`
		 ORDER BY c.last_activity_at DESC
		 LIMIT $1`, args...)
	if err != nil {
		return nil, shared.Wrap("inbox", err)
	}
	defer rows.Close()

	out := []InboxRow{}
	for rows.Next() {
		var x InboxRow
		if err := rows.Scan(&x.ID, &x.State, &x.VisitorKey, &x.ReferrerMemberID, &x.LeadID,
			&x.ClaimedByUserID, &x.ClaimedAt, &x.TurnCount, &x.LastActivityAt, &x.CreatedAt,
			&x.LastMessage, &x.LastRole, &x.MessageCount); err != nil {
			return nil, shared.Wrap("scan inbox row", err)
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// Claim is a single conditional UPDATE: the WHERE clause IS the lock. Two
// people pressing the button at the same moment cannot both win, and the loser
// finds out instead of quietly sharing the customer.
func (r *pgxRepository) Claim(ctx context.Context, id, userID uuid.UUID) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE ai_conversations
		   SET state = 'human', claimed_by_user_id = $2, claimed_at = now(),
		       last_activity_at = now()
		 WHERE id = $1 AND state <> 'closed' AND claimed_by_user_id IS NULL`, id, userID)
	if err != nil {
		return false, shared.Wrap("claim conversation", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *pgxRepository) Release(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE ai_conversations
		   SET state = 'bot', claimed_by_user_id = NULL, claimed_at = NULL,
		       last_activity_at = now()
		 WHERE id = $1 AND state = 'human'`, id)
	if err != nil {
		return shared.Wrap("release conversation", err)
	}
	if tag.RowsAffected() == 0 {
		return shared.ErrNotFound
	}
	return nil
}

func (r *pgxRepository) AddUsage(ctx context.Context, in, out int) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO ai_usage_daily (day, tokens_in, tokens_out) VALUES (CURRENT_DATE, $1, $2)
		ON CONFLICT (day) DO UPDATE
		   SET tokens_in = ai_usage_daily.tokens_in + $1,
		       tokens_out = ai_usage_daily.tokens_out + $2`, in, out)
	return shared.Wrap("add usage", err)
}

// UsageDay is one day of spend.
type UsageDay struct {
	Day           string `json:"day"`
	Conversations int    `json:"conversations"`
	TokensIn      int64  `json:"tokens_in"`
	TokensOut     int64  `json:"tokens_out"`
}

func (r *pgxRepository) UsageRange(ctx context.Context, days int) ([]UsageDay, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), conversations, tokens_in, tokens_out
		  FROM ai_usage_daily
		 WHERE day > CURRENT_DATE - $1::int
		 ORDER BY day DESC`, days)
	if err != nil {
		return nil, shared.Wrap("usage range", err)
	}
	defer rows.Close()

	out := []UsageDay{}
	for rows.Next() {
		var u UsageDay
		if err := rows.Scan(&u.Day, &u.Conversations, &u.TokensIn, &u.TokensOut); err != nil {
			return nil, shared.Wrap("scan usage day", err)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *pgxRepository) UsageToday(ctx context.Context) (int, error) {
	var out int
	err := r.pool.QueryRow(ctx,
		`SELECT coalesce(tokens_out, 0) FROM ai_usage_daily WHERE day = CURRENT_DATE`).Scan(&out)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil // nothing spent yet today
		}
		return 0, shared.Wrap("usage today", err)
	}
	return out, nil
}
