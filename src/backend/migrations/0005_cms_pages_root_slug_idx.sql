-- +goose Up
-- CMS-4: enforce slug uniqueness among ROOT pages (parent_id IS NULL). The plain
-- UNIQUE(parent_id, slug) on cms_pages does NOT constrain roots because Postgres
-- treats NULLs as distinct, so two root pages could share a slug and collide on
-- the public URL. The partial unique index was added to the 0003 file, but goose
-- never re-runs an already-applied version — databases that applied 0003 before
-- that edit lack the index. Create it here (idempotent) so every database has it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_pages_root_slug
    ON cms_pages (slug) WHERE parent_id IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_cms_pages_root_slug;
