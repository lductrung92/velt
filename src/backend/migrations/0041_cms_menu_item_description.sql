-- +goose Up
-- One line of explanatory text under a menu item's label.
--
-- The site's header dropdown already shows such a line ("Danh mục, tính năng và
-- bản trải nghiệm" under "Sản phẩm"), written into the markup. Moving those
-- links into the menu builder without somewhere to keep it would quietly drop
-- the line, so the column comes first and the markup reads it.
ALTER TABLE cms_menu_items ADD COLUMN description TEXT;

COMMENT ON COLUMN cms_menu_items.description IS
    'Optional one-line note shown under the label (header dropdown, footer column). NULL = label only.';

-- +goose Down
ALTER TABLE cms_menu_items DROP COLUMN description;
