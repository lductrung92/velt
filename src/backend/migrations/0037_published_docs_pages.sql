-- +goose Up
-- Backfill published_docs with the Vietnamese row of every published CMS page.
--
-- Without this, moving the public read onto published_docs would 404 every page
-- that is already live: the read model is written at publish, and nothing has
-- republished the existing rows.
--
-- A page's URL is its own slug alone — the tree is editorial structure for the
-- admin list, not a path. See internal/modules/cms/pages/public_sync.go.
--
-- THIS MIGRATION CAN FAIL ON PURPOSE. cms_pages enforces UNIQUE (parent_id, slug),
-- which is sibling uniqueness, not URL uniqueness, so two published pages may
-- legally share a slug today; the public read silently served one of them and
-- the other was unreachable. published_docs makes the URL the primary key, so
-- the second row is rejected and the migration stops. That is the correct
-- outcome: somebody has to decide which page keeps the address. Run this first
-- to find out before deploying:
--
--   SELECT slug, count(*) FROM cms_pages
--    WHERE status = 'published' GROUP BY slug HAVING count(*) > 1;
--
-- Built from published_snapshot when there is one, and from the live columns
-- otherwise, so a page published before snapshots existed still gets a row.
INSERT INTO published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at)
SELECT
    'page',
    'vi',
    p.slug,
    p.id,
    true,
    trim(p.title || ' ' || coalesce(p.seo_description, '')),
    coalesce(
        p.published_snapshot,
        jsonb_build_object(
            'title',          p.title,
            'slug',           p.slug,
            'body_html',      p.body_html,
            'template',       p.template,
            'og_path',        p.og_path,
            'landing_id',     NULL,
            'inline_widgets', '[]'::jsonb,
            'seo', jsonb_build_object(
                'title',          p.seo_title,
                'description',    p.seo_description,
                'keywords',       p.seo_keywords,
                'canonical_url',  p.canonical_url,
                'noindex',        p.seo_noindex,
                'nofollow',       p.seo_nofollow,
                'og_title',       p.og_title,
                'og_description', p.og_description))),
    coalesce(p.published_at, now())
FROM cms_pages p
WHERE p.status = 'published';

-- +goose Down
DELETE FROM published_docs WHERE entity = 'page';
