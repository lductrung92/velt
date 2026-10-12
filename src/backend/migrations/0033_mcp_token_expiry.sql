-- +goose Up
-- An MCP credential had no end date: a leaked one stayed valid until somebody
-- noticed and revoked it by hand. Give every token a lifetime.
--
-- Nullable, and existing rows stay NULL: a token already sitting in someone's
-- agent config must not stop working because of a migration. New tokens get an
-- expiry from the application (see mcp.TokenStore.Issue).
--
-- No new index: Resolve still selects on token_hash, which idx_mcp_tokens_lookup
-- already covers for live rows; the expiry is a filter on the row it finds.
ALTER TABLE mcp_tokens ADD COLUMN expires_at TIMESTAMPTZ;

COMMENT ON COLUMN mcp_tokens.expires_at IS
    'When the credential stops resolving. NULL means it predates expiry support and never expires.';

-- +goose Down
ALTER TABLE mcp_tokens DROP COLUMN expires_at;
