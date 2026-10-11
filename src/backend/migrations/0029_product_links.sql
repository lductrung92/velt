-- +goose Up
-- The three relations that hang off a product (docs/domains/products §4.3–4.4):
-- its categories, the people who built it, and its gallery.

-- Many-to-many with product_categories. No payload of its own, so no surrogate
-- key: the pair IS the row.
CREATE TABLE product_category_links (
    product_id  UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES product_categories (id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);
-- The reverse direction (how many products use this category) is what the
-- taxonomy screen counts, and the PK only indexes the forward one.
CREATE INDEX idx_pcl_category ON product_category_links (category_id);

-- Many-to-many with members, but WITH a payload: `role` lives here rather than
-- on members because the same person can be "Backend" on one product and
-- "Quản lý dự án" on another. Empty → the site falls back to members.role.
CREATE TABLE product_members (
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    member_id  UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    role       TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, member_id)
);
CREATE INDEX idx_pm_member ON product_members (member_id);

-- Gallery: an ordered mix of uploaded images and embedded videos.
CREATE TABLE product_media (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    path       TEXT,       -- kind='image': products/<id>/gallery-<uuid>.<ext>
    video_url  TEXT,       -- kind='video': an embeddable URL
    caption    TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Let the database refuse a half-built row rather than trusting every
    -- future writer to get the pairing right (same approach as
    -- system_settings_value_xor in 0002).
    CONSTRAINT product_media_source_xor CHECK (
        (kind = 'image' AND path IS NOT NULL AND video_url IS NULL) OR
        (kind = 'video' AND video_url IS NOT NULL AND path IS NULL)
    )
);
CREATE INDEX idx_product_media_order ON product_media (product_id, sort_order);

-- +goose Down
DROP TABLE IF EXISTS product_media;
DROP TABLE IF EXISTS product_members;
DROP TABLE IF EXISTS product_category_links;
