-- +goose Up
-- The site's chrome — header, sidebar, footer — as content rather than markup.
--
-- A widget has had no identity of its own: it exists only as a node inside one
-- page's body_json, so the only place an editor could put one was in that page.
-- A menu was no better off: cms_menus.location says where a menu MAY render,
-- and the markup decided whether anything rendered there at all. This table is
-- the missing list — what each chrome region is made of, in order.
--
-- region is TEXT with no CHECK on purpose. The vocabulary (header/sidebar/
-- footer) is enforced in Go, next to the three slots the site actually renders,
-- the way the widget type vocabulary already is; a CHECK here would mean a
-- migration every time the site grows a slot, and the write path is the only
-- way rows get in.
--
-- No new permissions: reading the chrome is cms.page.view and editing it is
-- cms.menu.manage, because placing a menu in the header IS editing the
-- navigation, and the people who may do one may do the other.
CREATE TABLE cms_region_blocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region      TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('widget', 'menu')),
    widget_type TEXT,
    menu_id     UUID REFERENCES cms_menus(id) ON DELETE CASCADE,
    config      JSONB NOT NULL DEFAULT '{}',
    sort_order  INT NOT NULL DEFAULT 0,
    is_visible  BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A block is one thing or the other, never both and never neither: the
    -- public read branches on `kind` alone, so a widget row carrying a menu_id
    -- would be a target nothing would ever follow — a half-saved edit that
    -- looks saved.
    CONSTRAINT cms_region_blocks_kind_target CHECK (
        (kind = 'widget' AND widget_type IS NOT NULL AND menu_id IS NULL) OR
        (kind = 'menu' AND menu_id IS NOT NULL AND widget_type IS NULL)
    )
);

-- The only read there is: one region, in render order.
CREATE INDEX idx_cms_region_blocks_region ON cms_region_blocks (region, sort_order);

COMMENT ON COLUMN cms_region_blocks.region IS
    'Chrome slot the block renders in: header | sidebar | footer (vocabulary enforced in Go).';

-- +goose Down
DROP TABLE IF EXISTS cms_region_blocks;
