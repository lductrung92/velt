-- +goose Up
-- Many LLM endpoints instead of one, and an ordered chain per job.
--
-- WHY A TABLE AND NOT MORE SETTINGS
--   A provider is a RECORD (label, adapter, URL, key, on/off) and there can be
--   any number of them. Settings are one flat key→value map with one row per
--   key; expressing a collection there means inventing ai.provider.1.*,
--   ai.provider.2.* and a cap nobody can justify. The api_key also has to stay
--   AEAD-encrypted, which the settings layer does per key via IsSecret — a JSON
--   blob of providers would lose that.
--
-- WHY AN ORDERED CHAIN PER PURPOSE
--   Measured on Groq: every model on one account draws from the SAME request
--   budget, so rotating between models of one provider buys no extra quota.
--   Only a second provider does. A chain is therefore (provider, model) pairs
--   in priority order — one entry is "just use this", two or more is failover.
--   See docs/domains/ai/free-models.md §4.
--
-- The api_key column takes the ciphertext straight from system_settings: the
-- AEAD seals with a random nonce and NO additional data (crypto/aead.go), so a
-- blob encrypted for a settings key decrypts unchanged here.

CREATE TABLE ai_providers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label      text NOT NULL,
    kind       text NOT NULL,
    base_url   text NOT NULL DEFAULT '',
    api_key    bytea,
    enabled    boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ai_providers_kind_check CHECK (kind IN ('anthropic', 'openai')),
    CONSTRAINT ai_providers_label_check CHECK (btrim(label) <> '')
);

-- One row per step of one purpose's chain. ON DELETE CASCADE: removing a
-- provider removes the steps that pointed at it, because a step with no
-- endpoint is not a thing that can run.
CREATE TABLE ai_purpose_models (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose     text NOT NULL,
    provider_id uuid NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    model       text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ai_purpose_models_purpose_check CHECK (purpose IN ('chat', 'content')),
    CONSTRAINT ai_purpose_models_model_check CHECK (btrim(model) <> '')
);

CREATE INDEX ai_purpose_models_purpose_idx ON ai_purpose_models (purpose, sort_order);

-- Carry the single endpoint that exists today across, so an install that was
-- already answering keeps answering. The key travels as ciphertext.
INSERT INTO ai_providers (label, kind, base_url, api_key, enabled, sort_order)
SELECT
    -- A name a person recognises: the host it talks to ("api.groq.com"), or
    -- the adapter when no URL was set. Renameable in the console afterwards.
    COALESCE(
        NULLIF(split_part(split_part(COALESCE(b.value #>> '{}', ''), '://', 2), '/', 1), ''),
        NULLIF(btrim(p.value #>> '{}'), ''),
        'anthropic'),
    COALESCE(NULLIF(btrim(p.value #>> '{}'), ''), 'anthropic'),
    COALESCE(b.value #>> '{}', ''),
    k.value_encrypted,
    true,
    0
  FROM (SELECT value FROM system_settings WHERE key = 'ai.provider') p
  FULL JOIN (SELECT value FROM system_settings WHERE key = 'ai.base_url') b ON true
  FULL JOIN (SELECT value_encrypted FROM system_settings WHERE key = 'ai.api_key') k ON true
 WHERE EXISTS (SELECT 1 FROM system_settings WHERE key IN ('ai.provider', 'ai.base_url', 'ai.api_key'));

-- One chain step per purpose, from whatever model that purpose was using:
-- its own override if it had one, otherwise the shared ai.model.
INSERT INTO ai_purpose_models (purpose, provider_id, model, sort_order)
SELECT v.purpose, pr.id, v.model, 0
  FROM ai_providers pr
  CROSS JOIN LATERAL (
        VALUES
          ('chat', COALESCE(
              NULLIF(btrim((SELECT value #>> '{}' FROM system_settings WHERE key = 'ai.model.chat')), ''),
              NULLIF(btrim((SELECT value #>> '{}' FROM system_settings WHERE key = 'ai.model')), ''))),
          ('content', COALESCE(
              NULLIF(btrim((SELECT value #>> '{}' FROM system_settings WHERE key = 'ai.model.content')), ''),
              NULLIF(btrim((SELECT value #>> '{}' FROM system_settings WHERE key = 'ai.model')), '')))
       ) AS v(purpose, model)
 WHERE v.model IS NOT NULL;

-- The endpoint now lives in ai_providers and the model in ai_purpose_models.
-- Leaving the old keys behind would be two sources of truth for one answer.
DELETE FROM system_settings
 WHERE key IN ('ai.provider', 'ai.base_url', 'ai.api_key',
               'ai.model', 'ai.model.chat', 'ai.model.content');

-- +goose Down
DROP TABLE ai_purpose_models;
DROP TABLE ai_providers;
