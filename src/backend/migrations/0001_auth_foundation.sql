-- +goose Up
-- Auth foundation: users, RBAC (roles/permissions/joins), sessions, reset
-- tokens, 2FA secrets. Seeds the 3 system roles and the foundation permission
-- catalog (docs/domains/auth/permissions.md). Idempotent seeds via ON CONFLICT.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              CITEXT NOT NULL UNIQUE,
    password_hash      TEXT NOT NULL,
    full_name          TEXT NOT NULL,
    avatar_path        TEXT,
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked')),
    email_verified_at  TIMESTAMPTZ,
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until       TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_status ON users (status);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES users (id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles (role_id);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_permission ON role_permissions (permission_id);

CREATE TABLE auth_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_agent         TEXT,
    ip                 INET,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at       TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX idx_auth_sessions_expires ON auth_sessions (expires_at);

CREATE TABLE password_reset_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    requested_ip INET,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prt_user ON password_reset_tokens (user_id);
CREATE INDEX idx_prt_expires ON password_reset_tokens (expires_at);

CREATE TABLE two_factor_secrets (
    user_id          UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret_encrypted BYTEA NOT NULL,
    recovery_codes   JSONB NOT NULL DEFAULT '[]',
    enabled_at       TIMESTAMPTZ,
    last_used_step   BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: system roles.
INSERT INTO roles (code, name, description, is_system) VALUES
    ('super_admin', 'Super Admin', 'Full access (wildcard)', true),
    ('admin', 'Admin', 'Platform administration', true),
    ('editor', 'Editor', 'Self-service baseline', true)
ON CONFLICT (code) DO NOTHING;

-- Seed: foundation permission catalog.
INSERT INTO permissions (code, description) VALUES
    ('*', 'Wildcard — all permissions'),
    ('users.read', 'View users'),
    ('users.create', 'Create users'),
    ('users.update', 'Update users'),
    ('users.delete', 'Delete/disable users'),
    ('users.assign_role', 'Assign/remove roles'),
    ('roles.read', 'View roles and their permissions'),
    ('roles.manage', 'Create/update/delete roles, assign permissions'),
    ('permissions.read', 'View permission catalog'),
    ('sessions.read', 'View other users'' sessions'),
    ('sessions.revoke', 'Revoke other users'' sessions'),
    ('settings.read', 'Read system settings'),
    ('settings.manage', 'Update system settings'),
    ('impersonation.start', 'Impersonate another user')
ON CONFLICT (code) DO NOTHING;

-- Map: super_admin → '*'.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'super_admin' AND p.code = '*'
ON CONFLICT DO NOTHING;

-- Map: admin → everything except wildcard and impersonation.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code NOT IN ('*', 'impersonation.start')
ON CONFLICT DO NOTHING;

-- editor → no foundation permissions (self-service only).

-- +goose Down
DROP TABLE IF EXISTS two_factor_secrets;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
