-- +goose Up
-- Desktop notifications for the people on chat duty.
--
-- The console only learns about a new message while a tab is open, because the
-- inbox polls. A visitor who asks for a human at 21:00 therefore reaches
-- nobody. Web Push is the standard answer: the browser keeps a subscription
-- alive after the tab is closed, and the server pushes to it.
--
-- WHY NOT FCM/FIREBASE
--   Web Push is a W3C standard with VAPID. Chrome's endpoint happens to live
--   on fcm.googleapis.com, Firefox uses Mozilla's and Safari Apple's — all
--   three are reached with one self-signed VAPID key pair and no vendor
--   project. See docs/domains/ai/README.md.
--
-- One row per browser install, not per person: the same operator on a desktop
-- and a laptop is two subscriptions, and each dies on its own schedule.
CREATE TABLE staff_push_subs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The push service URL. Unique because re-subscribing the same browser
    -- returns the same endpoint: that must update the row, not add a second.
    endpoint     text NOT NULL UNIQUE,
    p256dh       text NOT NULL,
    auth         text NOT NULL,
    label        text NOT NULL DEFAULT '',
    last_used_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_push_subs_endpoint_check CHECK (btrim(endpoint) <> '')
);

CREATE INDEX staff_push_subs_user_idx ON staff_push_subs (user_id);

-- The server's own VAPID identity to the push services.
--
-- Its own table rather than two settings rows: it is not an operator choice,
-- it is generated once and must then never change — rotating it silently
-- invalidates every browser already subscribed. Settings also gate writes on
-- settings.manage, while the person who turns notifications on only holds
-- ai.chat.handle, so the key would be unwritable at exactly the moment it is
-- needed. The private half is AEAD-encrypted, like every other secret here.
--
-- One row, enforced by the primary key: `id` can only ever be true.
CREATE TABLE push_keys (
    id          boolean PRIMARY KEY DEFAULT true,
    public_key  text NOT NULL,
    private_key bytea NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_keys_single_row CHECK (id)
);

-- When this conversation last caused a notification.
--
-- In a column rather than in memory so several API instances agree, and so a
-- restart does not re-notify everyone about a conversation they already know
-- about. A visitor typing five lines must ring once, not five times.
ALTER TABLE ai_conversations
    ADD COLUMN last_notified_at timestamptz;

-- +goose Down
ALTER TABLE ai_conversations DROP COLUMN last_notified_at;
DROP TABLE push_keys;
DROP TABLE staff_push_subs;
