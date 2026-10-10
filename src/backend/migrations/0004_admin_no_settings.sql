-- +goose Up
-- System settings become super_admin-only. Migration 0001 granted the `admin`
-- role every non-wildcard permission (which included settings.read/manage); this
-- revokes those two from `admin`. super_admin retains access via the '*' wildcard.
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE code = 'admin')
  AND permission_id IN (
    SELECT id FROM permissions WHERE code IN ('settings.read', 'settings.manage')
  );

-- +goose Down
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code IN ('settings.read', 'settings.manage')
ON CONFLICT DO NOTHING;
