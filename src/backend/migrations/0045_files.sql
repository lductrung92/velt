-- +goose Up
-- The lookup table a flat public URL needs.
--
-- Today an asset's URL IS its storage path: /api/files/cms/articles/<uuid>/
-- featured-<rand>.png. That leaks the folder layout, pins the owner's uuid into
-- every published page, and makes "move the bucket" a link-breaking event. The
-- new URLs are flat — /files/{slug}.{ext} and /img/{slug}/{w}.{ext} — and a flat
-- key has to be resolved back to a storage key somewhere. This is that somewhere.
--
-- Three columns earn their place beyond the lookup:
--   * width/height — the front-end cannot set <img width height> without them,
--     and not setting them is the project's CLS score.
--   * sha256 — a real ETag, and a stable name for the resized/re-encoded
--     derivative on disk. A derivative keyed by storage path would have to be
--     invalidated by hand; keyed by content hash it simply never collides.
--   * a row per asset — orphan cleanup can read this table instead of grepping
--     body_html, which is what gcInlineMedia does today.
--
-- owner_kind is TEXT with no CHECK, like cms_region_blocks.region: the
-- vocabulary ('article' | 'landing' | 'product' | 'user' | 'member') lives in Go
-- beside the upload paths that write it, and a CHECK here would mean a migration
-- every time a module learns to upload. owner_id has no FK for the same reason —
-- it points at five different tables.
--
-- MIGRATION NOTE: this table is additive. /api/files/<key> keeps serving, because
-- the URLs inside already-published body_html are of that shape and this
-- migration does not rewrite stored HTML. Old assets get rows from the backfill
-- command (cmd/backfill-files), new uploads mint a slug as they are saved.
CREATE TABLE files (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL UNIQUE,
    storage_key  TEXT NOT NULL UNIQUE,
    mime         TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    sha256       TEXT NOT NULL,
    width        INT,
    height       INT,
    owner_kind   TEXT NOT NULL,
    owner_id     UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deleting an owner means reclaiming its files, and that is the only read of
-- this table that is not by slug.
CREATE INDEX idx_files_owner ON files (owner_kind, owner_id);

COMMENT ON COLUMN files.storage_key IS
    'Path inside the storage driver. UNIQUE: one stored object has one public identity, so re-minting a key is a no-op rather than a second slug nobody would ever delete.';
COMMENT ON COLUMN files.width IS
    'Pixel width, NULL when the asset is not a decodable raster image.';

-- +goose Down
DROP TABLE IF EXISTS files;
