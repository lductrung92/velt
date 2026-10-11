-- +goose Up
-- Team member profiles (docs/domains/members/README.md). Deliberately NOT the
-- `users` table: `users` is the console login identity (password, 2FA, RBAC,
-- sessions), while this is the public marketing profile. Keeping them apart means
-- someone who leaves the team does not need a live login just to keep product
-- pages intact, and a contributor who never signs in still gets a profile.
CREATE TABLE members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    full_name   TEXT NOT NULL,
    role        TEXT,
    bio         TEXT,
    avatar_path TEXT,
    email       TEXT,
    zalo        TEXT,
    links       JSONB NOT NULL DEFAULT '[]',
    skills      JSONB NOT NULL DEFAULT '[]',
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves both listings: the console list (all rows) and the public one
-- (is_active only), each ordered by the curated sort_order then name.
CREATE INDEX idx_members_listing ON members (is_active, sort_order, full_name);

INSERT INTO permissions (code, description) VALUES
    ('members.view', 'View team member profiles'),
    ('members.manage', 'Create/update/delete team member profiles')
ON CONFLICT (code) DO NOTHING;

-- admin → both (super_admin already covered by the '*' wildcard).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code LIKE 'members.%'
ON CONFLICT DO NOTHING;

-- editor → read only: they attach members to products but do not curate the roster.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code = 'members.view'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'members.%');
DELETE FROM permissions WHERE code LIKE 'members.%';
DROP TABLE IF EXISTS members;
