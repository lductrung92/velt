-- +goose Up
-- Backfill published_docs with the Vietnamese row of every published article.
--
-- Articles are the pilot: the rest of the content types follow once this path
-- has run in production. Kept in its own migration from 0034 on purpose — the
-- table and the data land separately so a failure here does not have to be
-- untangled from a schema change.
--
-- Built from the LIVE columns, not from published_snapshot. That is deliberate:
-- the public blog read today selects straight from cms_articles, so copying the
-- live columns reproduces exactly what visitors see right now. Reading the
-- snapshot instead would silently change behaviour for any article whose
-- snapshot never got written.
INSERT INTO published_docs (entity, locale, slug, entity_id, is_current, search_text, body, published_at)
SELECT
    'article',
    'vi',
    a.slug,
    a.id,
    true,
    trim(a.title || ' ' || coalesce(a.excerpt, '')),
    jsonb_build_object(
        'title',         a.title,
        'slug',          a.slug,
        'excerpt',       a.excerpt,
        'body_html',     a.body_html,
        'featured_path', a.featured_path,
        'category_id',   a.category_id,
        'tag_ids',       coalesce(
            (SELECT jsonb_agg(xt.tag_id) FROM cms_article_tags xt WHERE xt.article_id = a.id),
            '[]'::jsonb),
        'published_at',  a.published_at,
        'og_path',       a.og_path,
        'seo', jsonb_build_object(
            'title',          a.seo_title,
            'description',    a.seo_description,
            'keywords',       a.seo_keywords,
            'canonical_url',  a.canonical_url,
            'noindex',        a.seo_noindex,
            'nofollow',       a.seo_nofollow,
            'og_title',       a.og_title,
            'og_description', a.og_description)),
    coalesce(a.published_at, now())
FROM cms_articles a
WHERE a.status = 'published';

-- +goose Down
DELETE FROM published_docs WHERE entity = 'article';
