-- +goose Up
-- CRM bounded context, deliberately small: leads only
-- (docs/domains/crm/README.md). A lead is someone who showed interest AND left
-- a way to reach them back. It outlives the conversation that produced it,
-- which is why it lives here rather than inside the ai module.
CREATE TABLE leads (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT,
    email   TEXT,
    phone   TEXT,
    zalo    TEXT,

    -- Where it came from. `chat` rows carry conversation_id once the ai module
    -- exists; the FK is added by that migration so the two can ship in order.
    source          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('chat', 'form', 'manual')),
    conversation_id UUID,

    -- The member who introduced the visitor (?ref=), or NULL for the shared
    -- queue. ON DELETE SET NULL, not CASCADE: a member leaving must never take
    -- customer records with them.
    assigned_member_id UUID REFERENCES members (id) ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'new'
           CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
    note   TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A lead with no way to contact it is not a lead. Enforced here so no
    -- future writer can create one by accident.
    CONSTRAINT leads_reachable CHECK (
        coalesce(email, '') <> '' OR
        coalesce(phone, '') <> '' OR
        coalesce(zalo,  '') <> ''
    )
);

-- The two listings the console needs: the shared queue and one member's own.
CREATE INDEX idx_leads_inbox ON leads (status, created_at DESC);
CREATE INDEX idx_leads_assigned ON leads (assigned_member_id, status, created_at DESC);

-- Which products a lead asked about. Many-to-many: visitors usually weigh up a
-- couple of things before choosing.
CREATE TABLE lead_products (
    lead_id    UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    PRIMARY KEY (lead_id, product_id)
);
CREATE INDEX idx_lead_products_product ON lead_products (product_id);

INSERT INTO permissions (code, description) VALUES
    ('crm.leads.view', 'View leads assigned to you and the shared queue'),
    ('crm.leads.view_all', 'View every lead, including other people''s'),
    ('crm.leads.manage', 'Create, edit, assign and move leads')
ON CONFLICT (code) DO NOTHING;

-- admin → everything (super_admin already covered by the '*' wildcard).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code LIKE 'crm.%'
ON CONFLICT DO NOTHING;

-- editor → work their own leads, but not browse everyone else's. The split
-- matters little in a small team and a lot once the team is not small.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code IN ('crm.leads.view', 'crm.leads.manage')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'crm.%');
DELETE FROM permissions WHERE code LIKE 'crm.%';
DROP TABLE IF EXISTS lead_products;
DROP TABLE IF EXISTS leads;
