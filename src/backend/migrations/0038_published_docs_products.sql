-- +goose Up
-- Backfill published_docs with the Vietnamese row of every published product.
--
-- The catalog's public read now comes from published_docs, and that table is
-- only written at publish. Without this, every product already on the site
-- would 404 until somebody republished it one by one.
--
-- Built straight from published_snapshot: unlike articles and pages, a product
-- always has one — the catalog writes it on every transition into `published`,
-- and the public API has always read it rather than the live columns. Copying
-- it is therefore exactly what visitors see today.
--
-- `products.slug` is UNIQUE, so unlike cms_pages this cannot collide.
INSERT INTO published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at)
SELECT
    'product',
    'vi',
    p.slug,
    p.id,
    true,
    trim(coalesce(p.published_snapshot ->> 'name', p.name) || ' ' ||
         coalesce(p.published_snapshot ->> 'summary', '')),
    p.published_snapshot,
    coalesce(p.published_at, now())
FROM products p
WHERE p.status = 'published' AND p.published_snapshot IS NOT NULL;

-- +goose Down
DELETE FROM published_docs WHERE entity = 'product';
