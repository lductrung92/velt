-- +goose Up
-- CMS: the first business module on the foundation. Creates the full 12-table
-- cms_* schema (articles, taxonomy, pages, menus, comments, edit-requests,
-- landing builder, newsletter) up front so later phases add services without
-- further schema churn, and seeds the cms.* permission catalog + role mappings
-- (admin → all; editor → an own-content subset). Idempotent seeds via ON CONFLICT.
-- Feature flags (cms.*) live in the settings registry, NOT in a table here.

-- Taxonomy (referenced by articles).
CREATE TABLE cms_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    parent_id       UUID REFERENCES cms_categories (id) ON DELETE RESTRICT,
    description     TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    seo_title       TEXT,
    seo_description TEXT,
    seo_keywords    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_categories_parent ON cms_categories (parent_id, sort_order);

CREATE TABLE cms_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Articles + editorial workflow.
CREATE TABLE cms_articles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    slug               TEXT NOT NULL UNIQUE,
    excerpt            TEXT,
    body_html          TEXT,
    body_json          JSONB,
    category_id        UUID REFERENCES cms_categories (id) ON DELETE SET NULL,
    author_id          UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status             TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_review', 'published', 'pending_edit', 'scheduled', 'archived')),
    featured_path      TEXT,
    og_path            TEXT,
    seo_title          TEXT,
    seo_description    TEXT,
    seo_keywords       TEXT,
    canonical_url      TEXT,
    seo_noindex        BOOLEAN NOT NULL DEFAULT false,
    seo_nofollow       BOOLEAN NOT NULL DEFAULT false,
    og_title           TEXT,
    og_description     TEXT,
    published_at       TIMESTAMPTZ,
    published_snapshot JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_articles_status_pub ON cms_articles (status, published_at DESC);
CREATE INDEX idx_cms_articles_cat_status ON cms_articles (category_id, status);
CREATE INDEX idx_cms_articles_author ON cms_articles (author_id);

CREATE TABLE cms_article_tags (
    article_id UUID NOT NULL REFERENCES cms_articles (id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES cms_tags (id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX idx_cms_article_tags_tag ON cms_article_tags (tag_id);

-- Static pages (admin-only, hierarchical, 4-state).
CREATE TABLE cms_pages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,
    slug               TEXT NOT NULL,
    body_html          TEXT,
    body_json          JSONB,
    parent_id          UUID REFERENCES cms_pages (id) ON DELETE RESTRICT,
    sort_order         INT NOT NULL DEFAULT 0,
    template           TEXT,
    status             TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    og_path            TEXT,
    seo_title          TEXT,
    seo_description    TEXT,
    seo_keywords       TEXT,
    canonical_url      TEXT,
    seo_noindex        BOOLEAN NOT NULL DEFAULT false,
    seo_nofollow       BOOLEAN NOT NULL DEFAULT false,
    og_title           TEXT,
    og_description     TEXT,
    published_at       TIMESTAMPTZ,
    published_snapshot JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (parent_id, slug)
);
CREATE INDEX idx_cms_pages_status_pub ON cms_pages (status, published_at DESC);
CREATE INDEX idx_cms_pages_parent ON cms_pages (parent_id, sort_order);
-- UNIQUE (parent_id, slug) does NOT constrain root pages: Postgres treats NULLs
-- as distinct, so two roots (parent_id IS NULL) could share a slug and collide
-- on the public URL. Enforce slug uniqueness among roots with a partial index.
CREATE UNIQUE INDEX idx_cms_pages_root_slug ON cms_pages (slug) WHERE parent_id IS NULL;

-- Navigation menus.
CREATE TABLE cms_menus (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    location   TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cms_menu_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id      UUID NOT NULL REFERENCES cms_menus (id) ON DELETE CASCADE,
    parent_id    UUID REFERENCES cms_menu_items (id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    link_type    TEXT NOT NULL
        CHECK (link_type IN ('internal', 'external', 'article', 'page', 'category')),
    target_id    UUID, -- polymorphic (article/page/category); NOT an FK, resolved at the public API
    url          TEXT,
    open_new_tab BOOLEAN NOT NULL DEFAULT false,
    sort_order   INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_cms_menu_items_tree ON cms_menu_items (menu_id, parent_id, sort_order);

-- Comments + moderation queue (threaded).
CREATE TABLE cms_comments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id     UUID NOT NULL REFERENCES cms_articles (id) ON DELETE CASCADE,
    parent_id      UUID REFERENCES cms_comments (id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    author_name    TEXT NOT NULL,
    author_email   CITEXT, -- PII: never returned to the public
    body           TEXT NOT NULL, -- plain text, never HTML
    ip_address     INET, -- PII: rate-limit/audit only
    status         TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'spam', 'rejected')),
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_comments_article ON cms_comments (article_id, status, created_at DESC);
CREATE INDEX idx_cms_comments_queue ON cms_comments (status, created_at DESC);

-- Edit requests for published articles (editor → admin).
CREATE TABLE cms_edit_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id   UUID NOT NULL REFERENCES cms_articles (id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    reason       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    review_note  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one pending request per article.
CREATE UNIQUE INDEX idx_cms_edit_requests_pending ON cms_edit_requests (article_id) WHERE status = 'pending';
CREATE INDEX idx_cms_edit_requests_queue ON cms_edit_requests (status, created_at DESC);

-- Landing builder.
CREATE TABLE cms_landing_pages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    og_path            TEXT,
    seo_title          TEXT,
    seo_description    TEXT,
    seo_keywords       TEXT,
    canonical_url      TEXT,
    seo_noindex        BOOLEAN NOT NULL DEFAULT false,
    seo_nofollow       BOOLEAN NOT NULL DEFAULT false,
    og_title           TEXT,
    og_description     TEXT,
    published_snapshot JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_landing_status ON cms_landing_pages (status);

CREATE TABLE cms_landing_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landing_page_id UUID NOT NULL REFERENCES cms_landing_pages (id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN (
        'hero', 'slider', 'featured_articles', 'categories_showcase', 'rich_text',
        'cta_banner', 'testimonials', 'logos', 'stats', 'media_text',
        'newsletter', 'faq', 'gallery', 'html_embed')),
    sort_order      INT NOT NULL DEFAULT 0,
    is_visible      BOOLEAN NOT NULL DEFAULT true,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_landing_sections_order ON cms_landing_sections (landing_page_id, sort_order);

-- Newsletter subscribers.
CREATE TABLE cms_newsletter_subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL UNIQUE,
    source_key      TEXT,
    ip_address      INET, -- PII: rate-limit/audit only
    confirmed_at    TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cms_newsletter_created ON cms_newsletter_subscribers (created_at DESC);

-- Seed: cms permission catalog (docs/domains/cms/permissions.md).
INSERT INTO permissions (code, description) VALUES
    ('cms.article.view', 'View articles (editor: own only)'),
    ('cms.article.create', 'Create articles'),
    ('cms.article.edit', 'Edit articles'),
    ('cms.article.delete', 'Delete articles'),
    ('cms.article.submit', 'Submit articles for review'),
    ('cms.article.review', 'Approve/reject articles pending review'),
    ('cms.article.publish', 'Publish / schedule / unpublish / re-publish articles'),
    ('cms.article.request_edit', 'Request an edit of a published article'),
    ('cms.article.approve_edit_request', 'Approve/reject edit requests'),
    ('cms.page.view', 'View static pages'),
    ('cms.page.create', 'Create static pages'),
    ('cms.page.edit', 'Edit static pages'),
    ('cms.page.delete', 'Delete static pages'),
    ('cms.page.publish', 'Publish/unpublish static pages'),
    ('cms.taxonomy.manage', 'Create/update/delete categories and tags'),
    ('cms.menu.manage', 'Manage navigation menus'),
    ('cms.comment.moderate', 'Moderate comments'),
    ('cms.landing.manage', 'Manage landing pages'),
    ('cms.settings.read', 'Read CMS feature flags'),
    ('cms.settings.manage', 'Update CMS feature flags')
ON CONFLICT (code) DO NOTHING;

-- Map: admin → every cms.* permission (super_admin already covered by '*').
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code LIKE 'cms.%'
ON CONFLICT DO NOTHING;

-- Map: editor → own-content subset (no review/publish/page/taxonomy/menu/landing).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code IN (
    'cms.article.view', 'cms.article.create', 'cms.article.edit', 'cms.article.delete',
    'cms.article.submit', 'cms.article.request_edit', 'cms.comment.moderate', 'cms.settings.read')
ON CONFLICT DO NOTHING;

-- +goose Down
-- Removing the cms.* permissions cascades the role_permissions rows (FK CASCADE).
DELETE FROM permissions WHERE code LIKE 'cms.%';
DROP TABLE IF EXISTS cms_newsletter_subscribers;
DROP TABLE IF EXISTS cms_landing_sections;
DROP TABLE IF EXISTS cms_landing_pages;
DROP TABLE IF EXISTS cms_edit_requests;
DROP TABLE IF EXISTS cms_comments;
DROP TABLE IF EXISTS cms_menu_items;
DROP TABLE IF EXISTS cms_menus;
DROP TABLE IF EXISTS cms_pages;
DROP TABLE IF EXISTS cms_article_tags;
DROP TABLE IF EXISTS cms_articles;
DROP TABLE IF EXISTS cms_tags;
DROP TABLE IF EXISTS cms_categories;
