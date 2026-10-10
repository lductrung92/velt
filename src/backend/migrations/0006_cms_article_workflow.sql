-- +goose Up
-- CMS article workflow redesign (god-mode 2026-06-15): status-field model.
--   * pending_edit → needs_revision (admin trả bài về cho editor sửa; gộp luôn
--     vai trò reject-review + reopen-published của mô hình cũ).
--   * +author_role: lớp role người tạo lúc create (admin = reviewer, editor =
--     non-reviewer) → quyết định bài có qua duyệt khi cờ require_review ON.
--   * +review_note: lý do khi đặt needs_revision (gửi editor + audit).
--   * Gỡ luồng edit-request: DROP cms_edit_requests + 2 permission
--     (request_edit, approve_edit_request) — vai trò do needs_revision đảm nhận.

-- Migrate dữ liệu trạng thái trước khi đổi CHECK.
UPDATE cms_articles SET status = 'needs_revision' WHERE status = 'pending_edit';

ALTER TABLE cms_articles DROP CONSTRAINT cms_articles_status_check;
ALTER TABLE cms_articles ADD CONSTRAINT cms_articles_status_check
    CHECK (status IN ('draft', 'pending_review', 'needs_revision', 'scheduled', 'published', 'archived'));

ALTER TABLE cms_articles ADD COLUMN author_role TEXT NOT NULL DEFAULT 'editor';
ALTER TABLE cms_articles ADD COLUMN review_note TEXT;

-- Edit-request flow removed.
DROP TABLE IF EXISTS cms_edit_requests;

-- Remove the 2 edit-request permissions (role_permissions rows cascade via FK).
DELETE FROM permissions WHERE code IN ('cms.article.request_edit', 'cms.article.approve_edit_request');

-- +goose Down
-- Recreate the edit-request permissions + editor grant.
INSERT INTO permissions (code, description) VALUES
    ('cms.article.request_edit', 'Request an edit of a published article'),
    ('cms.article.approve_edit_request', 'Approve/reject edit requests')
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code IN ('cms.article.request_edit', 'cms.article.approve_edit_request')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'editor' AND p.code = 'cms.article.request_edit'
ON CONFLICT DO NOTHING;

-- Recreate cms_edit_requests.
CREATE TABLE IF NOT EXISTS cms_edit_requests (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_edit_requests_pending ON cms_edit_requests (article_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cms_edit_requests_queue ON cms_edit_requests (status, created_at DESC);

ALTER TABLE cms_articles DROP COLUMN IF EXISTS review_note;
ALTER TABLE cms_articles DROP COLUMN IF EXISTS author_role;

UPDATE cms_articles SET status = 'pending_edit' WHERE status = 'needs_revision';
ALTER TABLE cms_articles DROP CONSTRAINT cms_articles_status_check;
ALTER TABLE cms_articles ADD CONSTRAINT cms_articles_status_check
    CHECK (status IN ('draft', 'pending_review', 'published', 'pending_edit', 'scheduled', 'archived'));
