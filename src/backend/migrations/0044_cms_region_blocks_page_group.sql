-- +goose Up
-- A block stops being "something in the header" and becomes "something in the
-- header OF THIS KIND OF PAGE".
--
-- The flat vocabulary could not say "only on article pages" or "everywhere but
-- the home page", and measuring the site showed `sidebar` rendering on exactly
-- one page kind. page_group is the block's node in the editorial page tree
-- (common → blog → blog_detail); a page takes, per slot, the list of the
-- nearest ancestor that has a non-empty one.
--
-- `region` keeps its column name but no longer means a region: it is now the
-- SLOT, the physical place in the layout. Renaming it would touch every query
-- in the module to buy one accurate word, so the name stays and this comment
-- carries the meaning.
--
-- No data migration: the feature is uncommitted and the table is empty. Were
-- there rows, DEFAULT 'common' is where a header or footer block belonged
-- anyway; only a `sidebar` row would need moving to blog_detail by hand.
ALTER TABLE cms_region_blocks ADD COLUMN page_group TEXT NOT NULL DEFAULT 'common';

-- The only read there is: one group's one slot, in render order. The old index
-- led with `region`, which on its own no longer identifies a list.
DROP INDEX idx_cms_region_blocks_region;
CREATE INDEX idx_cms_region_blocks_slot
    ON cms_region_blocks (page_group, region, sort_order);

COMMENT ON COLUMN cms_region_blocks.page_group IS
    'Page group the block belongs to; descendant groups inherit it (vocabulary and the group x slot matrix enforced in Go).';
COMMENT ON COLUMN cms_region_blocks.region IS
    'Layout slot the block renders in: header | footer | sidebar_left | after_article | aside (vocabulary enforced in Go).';

-- +goose Down
DROP INDEX idx_cms_region_blocks_slot;
CREATE INDEX idx_cms_region_blocks_region ON cms_region_blocks (region, sort_order);
ALTER TABLE cms_region_blocks DROP COLUMN page_group;

COMMENT ON COLUMN cms_region_blocks.region IS
    'Chrome slot the block renders in: header | sidebar | footer (vocabulary enforced in Go).';
