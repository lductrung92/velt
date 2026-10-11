-- +goose Up
-- The product catalog (docs/domains/products/README.md §4.2).
--
-- Two INDEPENDENT status axes, deliberately not merged (§3):
--   status    — who can see the row at all: draft | published | archived
--   lifecycle — what the page says about the product: idea | building | launched
-- A team building in the open publishes a `launched=false` product on purpose,
-- so collapsing these into one column would remove a real product capability.
--
-- No price/plan columns: each product is sold differently (subscription,
-- licence, one-off), so monetisation gets its own table in its own module and
-- references products.id. See §7.
CREATE TABLE products (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug               TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    summary            TEXT,
    body_html          TEXT,
    body_json          JSONB,
    cover_path         TEXT,

    status             TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    lifecycle          TEXT NOT NULL DEFAULT 'idea'
        CHECK (lifecycle IN ('idea', 'building', 'launched')),

    version            TEXT,
    released_at        DATE,

    -- Display/filter labels with no attributes of their own and no page to link
    -- to, so they are values rather than rows. Categories are the opposite (they
    -- own a slug + a public landing) and get their own table in 0026.
    audience           JSONB NOT NULL DEFAULT '[]',
    platforms          JSONB NOT NULL DEFAULT '[]',
    tech_stack         JSONB NOT NULL DEFAULT '[]',
    highlights         JSONB NOT NULL DEFAULT '[]',

    is_featured        BOOLEAN NOT NULL DEFAULT false,
    sort_order         INT NOT NULL DEFAULT 0,

    product_url        TEXT,
    demo_url           TEXT,
    demo_access        TEXT,
    demo_instructions  JSONB NOT NULL DEFAULT '[]',

    seo_title          TEXT,
    seo_description    TEXT,
    seo_keywords       TEXT,
    canonical_url      TEXT,
    seo_noindex        BOOLEAN NOT NULL DEFAULT false,
    seo_nofollow       BOOLEAN NOT NULL DEFAULT false,
    og_title           TEXT,
    og_description     TEXT,
    og_path            TEXT,

    published_at       TIMESTAMPTZ,
    -- Frozen copy served to the public, so editing a draft never leaks to the
    -- site mid-edit. Same mechanism as cms_articles.published_snapshot.
    published_snapshot JSONB,

    created_by         UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_status    ON products (status, published_at DESC);
CREATE INDEX idx_products_lifecycle ON products (lifecycle);
CREATE INDEX idx_products_listing   ON products (is_featured DESC, sort_order, name);

-- The rest of the products.* catalog; products.view and products.category.manage
-- already exist from 0026.
INSERT INTO permissions (code, description) VALUES
    ('products.create', 'Create products'),
    ('products.edit', 'Edit products'),
    ('products.delete', 'Delete products'),
    ('products.publish', 'Publish / unpublish / archive products')
ON CONFLICT (code) DO NOTHING;

-- admin → every products.* permission (super_admin already covered by '*').
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code LIKE 'products.%'
ON CONFLICT DO NOTHING;

-- editor → author products but not publish or delete them.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code IN ('products.create', 'products.edit')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
    WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE code IN ('products.create', 'products.edit', 'products.delete', 'products.publish')
    );
DELETE FROM permissions
    WHERE code IN ('products.create', 'products.edit', 'products.delete', 'products.publish');
DROP TABLE IF EXISTS products;
