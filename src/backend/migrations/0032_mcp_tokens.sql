-- +goose Up
-- Long-lived credentials for MCP clients (docs/domains/ai/README.md §1).
--
-- A token maps to a PERSON, not to a set of permissions. Tools then run under
-- that user's own permissions, so revoking someone's access in the console
-- revokes their agent too — there is no second place to remember.
CREATE TABLE mcp_tokens (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    -- Only the hash is stored. The plaintext is shown once, at creation, and
    -- is unrecoverable afterwards — the same bargain as any API key.
    token_hash TEXT NOT NULL UNIQUE,
    -- First characters of the token, so a list can identify which is which
    -- without being able to reconstruct one.
    token_hint TEXT NOT NULL,

    label        TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup on every MCP call, so it is the index that matters.
CREATE INDEX idx_mcp_tokens_lookup ON mcp_tokens (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_mcp_tokens_owner ON mcp_tokens (user_id, created_at DESC);

INSERT INTO permissions (code, description) VALUES
    ('ai.mcp.use', 'Issue and use MCP tokens for agent access')
ON CONFLICT (code) DO NOTHING;

-- admin only to start with: an MCP token is a standing grant of whatever its
-- owner can do, so handing them out is a decision, not a convenience.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code = 'ai.mcp.use'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'ai.mcp.use');
DELETE FROM permissions WHERE code = 'ai.mcp.use';
DROP TABLE IF EXISTS mcp_tokens;
