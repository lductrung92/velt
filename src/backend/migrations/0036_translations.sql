-- +goose Up
-- The editing side of translation: what a translator has typed but not yet
-- published. See docs/domains/translation/README.md §3.2.
--
-- One row per record per language, with the values in JSONB rather than one row
-- per field: a product has around eight translatable fields, so field-per-row
-- turns reading a 20-item list into 160 rows to gather and pivot.
--
-- Nothing public reads this table. The public surface reads published_docs, into
-- which these values are folded at publish time. That is why JSONB is the right
-- shape here and the wrong shape there: this side wants to accept a new
-- translatable field without a migration, that side wants to be indexed.
--
-- `entity` is dynamic, so there is no foreign key. The owning module calls
-- Purge() when it deletes a record; an orphan here only wastes space.
CREATE TABLE translations (
    entity     TEXT        NOT NULL,
    entity_id  UUID        NOT NULL,
    locale     TEXT        NOT NULL,
    values     JSONB       NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, entity_id, locale)
);

COMMENT ON TABLE translations IS
    'Draft-side translations. Console reads and writes this; the public surface never does.';

-- No unique index on the translated slug: slug uniqueness is enforced by the
-- primary key of published_docs, at publish, where it can be enforced across
-- base and translated slugs at once. Catching it here as well would reject a
-- draft for colliding with a slug that may never be published.

-- +goose Down
DROP TABLE translations;
