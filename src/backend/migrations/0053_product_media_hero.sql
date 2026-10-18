-- +goose Up
-- Which capture represents the product at the top of its page.
--
-- The hero shows one frame per device the product supports, and until now it
-- picked whatever came first in sort order. That is the wrong picker: the
-- first screenshot is usually the one that documents best, not the one that
-- LOOKS best shrunk into a phone outline at the top of a page. So the choice
-- becomes explicit — a checkbox in the console, this column underneath.
--
-- NOT UNIQUE per product: a product shows one hero per device, so a phone
-- capture and a desktop capture are both heroes. The one-per-device rule is
-- enforced where the flag is set (links_service.go), because it is a rule
-- about what an editor meant, and a constraint here could not express it
-- without also forbidding the moment in the middle of a swap.
--
-- Nothing is flagged by default: a product with no choice made keeps the old
-- behaviour, the first image of each device.
ALTER TABLE product_media
    ADD COLUMN is_hero BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN product_media.is_hero IS
    'anh dai dien cho thiet bi cua no o dau trang san pham';

-- The hero lookup is "this product, this device, flagged".
CREATE INDEX idx_product_media_hero
    ON product_media (product_id, device)
    WHERE is_hero;

-- +goose Down
DROP INDEX IF EXISTS idx_product_media_hero;
ALTER TABLE product_media DROP COLUMN is_hero;
