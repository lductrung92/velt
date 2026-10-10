-- +goose Up
-- A CMS page may attach a published landing page (its ordered builder sections
-- render on the page's public route). Nullable; ON DELETE SET NULL so removing a
-- landing detaches it from any hosting page without breaking the page.
ALTER TABLE cms_pages
    ADD COLUMN landing_id uuid REFERENCES cms_landing_pages(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE cms_pages DROP COLUMN landing_id;
