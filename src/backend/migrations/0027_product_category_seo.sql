-- +goose Up
-- Per-category SEO meta, mirroring cms_categories: the public site renders a
-- category landing (/san-pham?danh-muc=<slug>), and that page needs its own
-- title/description/keywords rather than inheriting the generic catalog meta.
--
-- Same three columns and same limits as cms_categories so both admin screens —
-- and both public renderers — stay interchangeable.
ALTER TABLE product_categories
    ADD COLUMN seo_title       TEXT,
    ADD COLUMN seo_description TEXT,
    ADD COLUMN seo_keywords    TEXT;

-- +goose Down
ALTER TABLE product_categories
    DROP COLUMN seo_title,
    DROP COLUMN seo_description,
    DROP COLUMN seo_keywords;
