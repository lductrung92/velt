-- +goose Up
-- Newsletter admin (list/delete subscribers) needs its own permission. The public
-- subscribe flow is a later phase; this perm gates only the admin management API.
INSERT INTO permissions (code, description) VALUES
    ('cms.newsletter.manage', 'Manage newsletter subscribers')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code = 'cms.newsletter.manage'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM permissions WHERE code = 'cms.newsletter.manage';
