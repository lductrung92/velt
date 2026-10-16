-- +goose Up
-- Retention clean-up for the activity log.
--
-- 0039 said the table was read-only by design and gave it no write permission.
-- It still has no write path — nothing inserts by hand — but it now has a way
-- OUT: an admin can delete everything older than a chosen window. That is a
-- different question from reading it, so it gets its own permission rather than
-- riding on activity.read: whoever may read the record of what everyone did is
-- not thereby allowed to erase it.
INSERT INTO permissions (code, description) VALUES
    ('activity.purge', 'Permanently delete activity log entries older than a chosen date')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code = 'activity.purge'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'activity.purge');
DELETE FROM permissions WHERE code = 'activity.purge';
