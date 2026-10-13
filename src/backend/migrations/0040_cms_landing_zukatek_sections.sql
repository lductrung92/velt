-- +goose Up
-- The public home page is becoming a landing page edited in the console, so the
-- five sections it was hand-built from have to exist as section types. The CHECK
-- is only widened — no existing type is dropped, so no stored row can be
-- invalidated by this migration.
ALTER TABLE cms_landing_sections DROP CONSTRAINT cms_landing_sections_type_check;
ALTER TABLE cms_landing_sections ADD CONSTRAINT cms_landing_sections_type_check
    CHECK (type IN (
        'hero', 'slider', 'featured_articles', 'categories_showcase', 'rich_text',
        'cta_banner', 'testimonials', 'logos', 'stats', 'media_text',
        'newsletter', 'faq', 'gallery', 'html_embed',
        'audience_picker', 'product_grid', 'team', 'buying_steps', 'contact_form'));

-- +goose Down
-- Deliberately does NOT delete sections of the five types: they are the owner's
-- content. If any exist the narrowing ALTER fails and the rollback stops, which
-- is the safe outcome — remove the sections in the console first, then roll back.
ALTER TABLE cms_landing_sections DROP CONSTRAINT cms_landing_sections_type_check;
ALTER TABLE cms_landing_sections ADD CONSTRAINT cms_landing_sections_type_check
    CHECK (type IN (
        'hero', 'slider', 'featured_articles', 'categories_showcase', 'rich_text',
        'cta_banner', 'testimonials', 'logos', 'stats', 'media_text',
        'newsletter', 'faq', 'gallery', 'html_embed'));
