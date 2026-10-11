-- +goose Up
-- AI assistant conversations (docs/domains/ai/README.md).
--
-- A conversation belongs to an anonymous visitor, not a user: nobody logs in to
-- ask a question. `state` is the invariant the whole module rests on — it
-- decides who is allowed to speak, and the assistant must fall silent the
-- moment it leaves 'bot'.
CREATE TABLE ai_conversations (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL DEFAULT 'bot'
          CHECK (state IN ('bot', 'waiting', 'human', 'closed')),

    -- Opaque per-browser key from a cookie. Only its owner may post into the
    -- conversation; it is not an identity and grants nothing else.
    visitor_key TEXT NOT NULL,

    -- The member whose ?ref= link brought the visitor here. SET NULL, never
    -- CASCADE: a member leaving must not delete customer conversations.
    referrer_member_id UUID REFERENCES members (id) ON DELETE SET NULL,
    lead_id            UUID REFERENCES leads (id) ON DELETE SET NULL,

    -- Who picked the conversation up, once someone did.
    claimed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    claimed_at         TIMESTAMPTZ,

    -- Per-conversation ceiling, counted here so a runaway loop is bounded
    -- without scanning ai_messages.
    turn_count INT NOT NULL DEFAULT 0,

    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The console inbox: live conversations, newest activity first.
CREATE INDEX idx_ai_conv_inbox ON ai_conversations (state, last_activity_at DESC);
CREATE INDEX idx_ai_conv_visitor ON ai_conversations (visitor_key, last_activity_at DESC);

-- `role` distinguishes the assistant from a real person. Without it a
-- transcript read back later cannot say who actually answered.
CREATE TABLE ai_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
    role            TEXT NOT NULL
                    CHECK (role IN ('visitor', 'assistant', 'staff', 'system')),
    author_user_id  UUID REFERENCES users (id) ON DELETE SET NULL,
    content         TEXT NOT NULL,
    token_in        INT NOT NULL DEFAULT 0,
    token_out       INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_messages_conv ON ai_messages (conversation_id, created_at);

-- Daily spend roll-up. Separate from the messages so the budget guard is one
-- cheap read on every turn rather than an aggregate over a growing table.
CREATE TABLE ai_usage_daily (
    day           DATE PRIMARY KEY,
    conversations INT NOT NULL DEFAULT 0,
    tokens_in     BIGINT NOT NULL DEFAULT 0,
    tokens_out    BIGINT NOT NULL DEFAULT 0
);

-- Who may work the inbox. Reading a transcript is reading a customer
-- conversation, so it is gated even though no personal data is required to
-- start one.
INSERT INTO permissions (code, description) VALUES
    ('ai.chat.handle', 'Read the assistant inbox and take over conversations')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('admin', 'editor') AND p.code = 'ai.chat.handle'
ON CONFLICT DO NOTHING;

-- The leads table shipped before this one, so its conversation_id could not be
-- a foreign key yet. Close the loop now.
ALTER TABLE leads
    ADD CONSTRAINT leads_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_conversation_fk;
DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'ai.chat.handle');
DELETE FROM permissions WHERE code = 'ai.chat.handle';
DROP TABLE IF EXISTS ai_usage_daily;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_conversations;
