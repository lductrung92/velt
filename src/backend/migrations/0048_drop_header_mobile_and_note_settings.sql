-- +goose Up
-- Retires two pieces of site chrome the layout no longer has anywhere to put.
--
-- 1. The "header_mobile" menu. The site used to keep a second menu just for the
--    phone drawer; the drawer now renders the header menu itself, so that
--    location had become a menu an admin could edit and never see. Its items
--    cascade with it, and its translations go with them.
--
-- 2. site.footer_note_title / site.footer_note_text — the footer's last column
--    is the newsletter opt-in now — and site.header_cta_label /
--    site.header_cta_url, whose button the menu's own "Liên hệ" link replaced.
--    The same four keys are stripped out of the site_chrome translations, which
--    hold one JSON object per locale rather than a row per field.
--
-- Deleting settings rows is safe to repeat and safe to leave applied: the API
-- writes a settings row lazily from its registry, and these keys are no longer
-- in the registry, so nothing puts them back.

DELETE FROM translations
 WHERE entity = 'menu_item'
   AND entity_id IN (
         SELECT i.id
           FROM cms_menu_items i
           JOIN cms_menus m ON m.id = i.menu_id
          WHERE m.location = 'header_mobile');

DELETE FROM translations
 WHERE entity = 'menu'
   AND entity_id IN (SELECT id FROM cms_menus WHERE location = 'header_mobile');

DELETE FROM cms_menus WHERE location = 'header_mobile';

DELETE FROM system_settings
 WHERE key IN ('site.footer_note_title', 'site.footer_note_text',
               'site.header_cta_label', 'site.header_cta_url');

UPDATE translations
   SET values = values - 'footer_note_title' - 'footer_note_text'
                       - 'header_cta_label' - 'header_cta_url'
 WHERE entity = 'site_chrome';

-- +goose Down
-- The rows held words somebody typed; this cannot invent them back. The menu
-- location and the four keys become writable again as soon as the code that
-- offers them is restored, which is what a rollback of this change means.
SELECT 1;
