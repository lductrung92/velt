-- +goose Up
-- Which device a screenshot was taken on.
--
-- The product page frames each gallery image in a device shell and lets the
-- reader switch between phone / tablet / desktop. Until now nothing recorded
-- which was which, so the site GUESSED: it matched words like "mobile" or
-- "ipad" in the caption, and fell back to the image's aspect ratio. Rewording
-- a caption moved a screenshot into a different frame, and a square-ish
-- tablet capture landed wherever the ratio thresholds put it.
--
-- THREE VALUES, NOT FOUR. A laptop and a desktop monitor both show the wide
-- layout, and a product team does not capture the same screen twice to fill
-- two tabs that would look alike. They share `desktop`; the site decides
-- which shell to draw around it.
--
-- NULLABLE, and null means "nobody has said yet". The existing rows are left
-- that way on purpose rather than backfilled with the same heuristic the site
-- is being relieved of: a guess written into a column stops looking like a
-- guess, and no one can later tell which rows a person chose and which ones a
-- regular expression did. The console shows the unassigned ones in their own
-- tab until someone sorts them out.
ALTER TABLE product_media
    ADD COLUMN device TEXT,
    ADD CONSTRAINT product_media_device_check
        CHECK (device IS NULL OR device IN ('phone', 'tablet', 'desktop'));

COMMENT ON COLUMN product_media.device IS
    'phone | tablet | desktop (laptop va man hinh PC dung chung); NULL = chua phan loai';

-- +goose Down
ALTER TABLE product_media
    DROP CONSTRAINT product_media_device_check,
    DROP COLUMN device;
