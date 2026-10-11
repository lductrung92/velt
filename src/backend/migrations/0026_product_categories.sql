-- +goose Up
-- Product taxonomy (docs/domains/products/README.md §4.1). Deliberately FLAT,
-- not a tree like cms_categories: the catalog has a handful of peer categories
-- (Cộng tác, Công cụ cá nhân, Quản lý & vận hành, AI & tự động hoá), and a
-- hierarchy would be complexity with no use. Flat → tree is a cheaper migration
-- later than tree → flat.
--
-- Separate from cms_categories on purpose: article sections and product
-- categories are different vocabularies, and sharing one table would mix them in
-- both admin screens.
CREATE TABLE product_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only listing there is: curated order, then name as a stable tiebreak.
CREATE INDEX idx_product_categories_sort ON product_categories (sort_order, name);

-- Only the two permissions this migration's feature needs. The rest of the
-- products.* catalog arrives with the products table itself; every insert is
-- ON CONFLICT DO NOTHING so the order does not matter.
INSERT INTO permissions (code, description) VALUES
    ('products.view', 'View products and product categories'),
    ('products.category.manage', 'Create/update/delete product categories')
ON CONFLICT (code) DO NOTHING;

-- admin → both (super_admin already covered by the '*' wildcard).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code IN ('products.view', 'products.category.manage')
ON CONFLICT DO NOTHING;

-- editor → read only: they attach products to categories but do not curate the
-- taxonomy itself.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code = 'products.view'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
    WHERE permission_id IN (
        SELECT id FROM permissions WHERE code IN ('products.view', 'products.category.manage')
    );
DELETE FROM permissions WHERE code IN ('products.view', 'products.category.manage');
DROP TABLE IF EXISTS product_categories;
