-- +goose Up
-- A status for both category taxonomies (CMS chuyên mục + catalog danh mục),
-- mirroring the one articles and pages already carry.
--
-- Three values, not the article workflow's six: a category is never submitted
-- for review and never scheduled, so pending_review / needs_revision /
-- scheduled would be states nothing in the codebase could ever put it in.
-- draft = being set up, published = in use, archived = retired but kept.
--
-- Every row that exists today is in use, so the column is NOT NULL DEFAULT
-- 'published': the default IS the backfill, and no existing category silently
-- becomes a draft. Nothing is dropped and no existing column is touched.
ALTER TABLE cms_categories
    ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
        CONSTRAINT cms_categories_status_check
        CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE product_categories
    ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
        CONSTRAINT product_categories_status_check
        CHECK (status IN ('draft', 'published', 'archived'));

-- +goose Down
ALTER TABLE cms_categories DROP COLUMN status;
ALTER TABLE product_categories DROP COLUMN status;
