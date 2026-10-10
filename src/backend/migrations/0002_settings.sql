-- +goose Up
-- System settings: key-value store backing the code registry. The table holds
-- VALUES only; key metadata (type/default/flags) lives in the Go registry.
-- No value seed: an absent row means "use the registry default" (the registry
-- is the single source of truth), so defaults never drift between code and DB.

CREATE TABLE system_settings (
    key             TEXT PRIMARY KEY,
    value           JSONB,
    value_encrypted BYTEA,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT system_settings_value_xor
        CHECK (NOT (value IS NOT NULL AND value_encrypted IS NOT NULL))
);
CREATE INDEX idx_system_settings_updated_by ON system_settings (updated_by);

-- +goose Down
DROP TABLE IF EXISTS system_settings;
