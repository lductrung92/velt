-- +goose Up
-- Several menus may share one location. The limit of one came from
-- cms_menus.location being UNIQUE in 0003: a location is where a menu may be
-- rendered, not the menu's identity, and the editor needs to prepare a second
-- header before switching to it.
--
-- No replacement index. Both readers — the admin list and the public read —
-- walk the whole table (a handful of rows, no WHERE), so their ORDER BY
-- location sorts rows already in hand rather than looking one up.
--
-- Nothing here decides WHICH menu at a location the public site renders; that
-- is menus.oldestMenu, and its comment says why it is temporary.
ALTER TABLE cms_menus DROP CONSTRAINT cms_menus_location_key;

-- +goose Down
-- Fails while two menus share a location — those rows have to be sorted out by
-- hand first, which is exactly what the constraint existed to prevent.
ALTER TABLE cms_menus ADD CONSTRAINT cms_menus_location_key UNIQUE (location);
