-- +goose Up
-- The public read model, lifted out of the content tables and given one row per
-- language. See docs/domains/translation/README.md §3.1.
--
-- Today each content table carries its own `published_snapshot` column, so the
-- public surface is four different shapes with four different lookup rules, and
-- there is nowhere to put a second language. This table makes the primary key BE
-- the URL, so a page view is one primary-key hit regardless of content type, and
-- a second language is just another row.
--
-- This migration only CREATES. `published_snapshot` stays in place and keeps
-- being written: until the read path has been moved and verified, both copies
-- exist on purpose, and rolling back is dropping this table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE published_docs (
    entity       TEXT        NOT NULL,
    locale       TEXT        NOT NULL,
    slug         TEXT        NOT NULL,
    entity_id    UUID        NOT NULL,
    is_current   BOOLEAN     NOT NULL DEFAULT true,
    search_text  TEXT        NOT NULL DEFAULT '',
    body         JSONB,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    written_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, locale, slug)
);

COMMENT ON TABLE published_docs IS
    'Public read model: one row per published URL (entity x locale x slug). Written at publish, read by /api/public/*.';
COMMENT ON COLUMN published_docs.is_current IS
    'false marks a retired slug kept only to answer 301. Those rows carry body = NULL.';
COMMENT ON COLUMN published_docs.published_at IS
    'The content''s publication date, shown to readers and used to order the list. It can be backdated.';
COMMENT ON COLUMN published_docs.written_at IS
    'When this row was last written. Separate from published_at because that one is editorial and may predate the row by years; this is what tells a translation saved since the last publish from one already carried.';
COMMENT ON COLUMN published_docs.search_text IS
    'Flattened title + summary of THIS locale, indexed with pg_trgm. Only for search; never served.';

-- Exactly one live URL per record per language. This is the constraint that makes
-- a duplicate slug impossible rather than merely unlikely: cms_pages currently
-- enforces UNIQUE (parent_id, slug), which does not constrain the flat public
-- lookup at all, so two published pages can share a slug and one of them becomes
-- permanently unreachable.
CREATE UNIQUE INDEX idx_pubdocs_one_live
    ON published_docs (entity, entity_id, locale) WHERE is_current;

-- Purge and alternates walk every row of a record, retired slugs included, so
-- this cannot be the partial index above.
CREATE INDEX idx_pubdocs_entity ON published_docs (entity, entity_id);

-- The public list: newest first within one content type and language.
CREATE INDEX idx_pubdocs_list
    ON published_docs (entity, locale, published_at DESC)
    WHERE is_current AND body IS NOT NULL;

-- One index covers search for every content type AND every language, because
-- locale is a column rather than a key inside JSON. Nothing in this system had a
-- text index before: public search is a sequential scan today.
CREATE INDEX idx_pubdocs_search
    ON published_docs USING gin (search_text gin_trgm_ops);

-- +goose Down
DROP TABLE published_docs;
