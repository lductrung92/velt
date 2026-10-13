-- +goose Up
-- The activity log: who changed what, and when.
--
-- The application already writes 122 structured log lines, but they cannot
-- answer that question. Only 52 carry an actor; the identifier key differs per
-- module (page / landing / article / product_id / target / role / menu / tag);
-- and the message is English prose rather than a stable code, so nothing can be
-- filtered on. This table is written deliberately, by a typed call, at the
-- points where a person changed state somebody may later have to account for.
--
-- Diagnostics stay in the JSON log. A line about a failed e-mail is not an
-- activity, and mixing the two would make this table untrustworthy by volume.
CREATE TABLE activity_log (
    id             BIGSERIAL   PRIMARY KEY,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    action         TEXT        NOT NULL,
    entity         TEXT,
    entity_id      UUID,
    entity_label   TEXT,
    actor_id       UUID,
    actor_label    TEXT        NOT NULL,
    ip             INET,
    correlation_id TEXT,
    metadata       JSONB       NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE activity_log IS
    'Append-only record of deliberate human actions. Written best-effort: a failed write warns, it never blocks the action it describes.';
COMMENT ON COLUMN activity_log.action IS
    'A stable code such as article.publish — never prose, because the console filters and translates on it.';
COMMENT ON COLUMN activity_log.actor_label IS
    'The actor''s name AS IT WAS. Deliberately not a join: a hard-deleted user must still be nameable, or the log only says somebody changed something.';
COMMENT ON COLUMN activity_log.entity_label IS
    'Likewise for the target — the record it refers to may be gone by the time anyone reads this.';
COMMENT ON COLUMN activity_log.actor_id IS
    'NULL means the system acted on its own (a scheduled publish, a cron).';
COMMENT ON COLUMN activity_log.correlation_id IS
    'Ties a row back to its request in the JSON log, which still holds the technical detail.';
COMMENT ON COLUMN activity_log.metadata IS
    'Extra context for this action. NEVER a secret value: settings changes record that a key changed, not what it changed to.';

-- A surrogate bigint, not a uuid: the table only ever appends and is only ever
-- read newest-first, so a sequential key keeps the index small and makes the
-- common scan cheap.
CREATE INDEX idx_activity_recent ON activity_log (occurred_at DESC);
-- "What did this person do?" and "what happened to this record?" are the two
-- questions the screen exists to answer; both filter before they sort.
CREATE INDEX idx_activity_actor  ON activity_log (actor_id, occurred_at DESC);
CREATE INDEX idx_activity_entity ON activity_log (entity, entity_id, occurred_at DESC);
CREATE INDEX idx_activity_action ON activity_log (action, occurred_at DESC);

-- Read-only by design: nothing writes this table by hand, so there is no
-- matching .manage.
INSERT INTO permissions (code, description) VALUES
    ('activity.read', 'Read the activity log')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code = 'activity.read'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'activity.read');
DELETE FROM permissions WHERE code = 'activity.read';
DROP TABLE activity_log;
