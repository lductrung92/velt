import { expect, test, type Page } from "@playwright/test";

import { mockApi } from "../mocks/api";

/**
 * The settings screen, as a reader meets it.
 *
 * Two things are checked that a unit test cannot see: that every tab is built
 * from the same layout — the controls of every row start at the same x — and
 * that nothing on screen is an untranslated key. The screenshots are written
 * for a human to look at afterwards.
 */

const CHROME_ID = "00000000-0000-0000-0000-00005174e000";

type Entry = Record<string, unknown>;
const str = (key: string, value = "") => ({ key, type: "string", value });
const int = (key: string, value: number) => ({ key, type: "int", value });
const bool = (key: string, value = false) => ({ key, type: "bool", value });
const secret = (key: string, isSet = false) => ({
  key,
  type: "secret",
  is_set: isSet,
});

/** The registry as the backend serves it: every group, every key. */
function settingsPayload(): Record<string, Entry[]> {
  return {
    general: [
      str("app.name", "Zukatek"),
      { ...str("app.logo_url", "/assets/logo.png"), format: "url_or_path" },
      { ...str("app.favicon_url"), format: "url_or_path" },
      { ...str("app.primary_color", "#0061fd"), format: "color" },
      {
        key: "app.default_locale",
        type: "enum",
        allowed_values: ["vi", "en"],
        value: "vi",
      },
      bool("app.language_switcher_enabled", true),
    ],
    site: [
      int("site.cache_ttl_seconds", 60),
      { ...str("site.og_image_url"), format: "url_or_path" },
      str("site.brand_tagline", "Đội ngũ phát triển sản phẩm số"),
      str("site.footer_note_title", "Con người đứng sau sản phẩm"),
      str("site.footer_note_text", "Xem đội ngũ phát triển, kỹ năng"),
      str("site.footer_copyright", "© {year} ZUKATEK."),
      str("site.header_cta_label", "Liên hệ"),
      str("site.header_cta_url", "/#contact"),
      { ...str("site.contact_email", "hello@zukatek.com"), format: "email" },
      { ...str("site.contact_zalo"), format: "url" },
      str("site.contact_phone", "0900 000 000"),
      str("site.address", "Hà Nội"),
      { ...str("site.social_facebook"), format: "url" },
      { ...str("site.social_linkedin"), format: "url" },
      { ...str("site.social_youtube"), format: "url" },
      { ...str("site.social_github"), format: "url" },
      int("site.blog_page_size", 9),
      int("site.products_page_size", 9),
    ],
    seo: [
      bool("seo.noindex_all"),
      str("seo.google_site_verification"),
      str("seo.analytics_id"),
    ],
    cms: [
      bool("cms.article.categorize"),
      bool("cms.article.allow_slug_edit", true),
      bool("cms.article.require_review"),
      bool("cms.newsletter.notify_on_publish"),
      bool("cms.publish.allow_now", true),
      str("cms.home_page_slug", "trang-chu"),
    ],
    translation: [
      bool("translation.enabled", true),
      str("translation.locales", "en"),
    ],
    email: [
      str("mail.smtp_host", "smtp.zukatek.com"),
      int("mail.smtp_port", 587),
      str("mail.smtp_user", "no-reply"),
      secret("mail.smtp_password", true),
      { ...str("mail.from_address", "no-reply@zukatek.com"), format: "email" },
      str("mail.from_name", "ZUKATEK"),
    ],
    storage: [
      {
        key: "storage.driver",
        type: "enum",
        allowed_values: ["local", "s3"],
        value: "local",
      },
      str("storage.s3_bucket"),
      str("storage.s3_region"),
      { ...str("storage.s3_endpoint"), format: "url" },
      str("storage.s3_access_key"),
      secret("storage.s3_secret"),
      int("storage.max_upload_mb", 10),
      int("files_storage_quota_mb", 100),
      int("files_max_upload_mb", 50),
    ],
    ai: [
      bool("ai.enabled", true),
      secret("ai.api_key", true),
      {
        key: "ai.provider",
        type: "enum",
        allowed_values: ["anthropic", "openai"],
        value: "anthropic",
      },
      str("ai.base_url"),
      str("ai.model", "claude-sonnet-5-5"),
      int("ai.max_turns", 30),
      int("ai.daily_token_cap", 2000000),
      int("ai.max_message_len", 2000),
      str("ai.system_persona"),
    ],
  };
}

async function openSettings(page: Page) {
  await mockApi(page);
  // The console's own language is Vietnamese; the screenshots are for a
  // Vietnamese reader, and an untranslated key is what this spec hunts.
  await page.addInitScript(() => {
    window.localStorage.setItem("velt.local.vne", "vi");
  });
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/settings", (r) => r.fulfill(json(settingsPayload())));
  await page.route("**/api/cms/pages**", (r) =>
    r.fulfill(
      json([
        { id: "p1", title: "Trang chủ", slug: "trang-chu", children: [] },
      ]),
    ),
  );
  await page.route(`**/api/translations/site_chrome/${CHROME_ID}`, (r) =>
    r.fulfill(
      json({
        entity: "site_chrome",
        entity_id: CHROME_ID,
        base_locale: "vi",
        locales: ["en"],
        translatable_fields: [
          "brand_tagline",
          "footer_note_title",
          "footer_note_text",
          "footer_copyright",
          "header_cta_label",
          "header_cta_url",
        ],
        translations: {},
        requires_republish: false,
      }),
    ),
  );
  await page.route("**/api/ai/status", (r) =>
    r.fulfill(
      json({
        enabled: true,
        degraded: false,
        reason: "",
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        base_url: "",
        has_key: true,
        staff_online: 2,
      }),
    ),
  );
  await page.route("**/api/ai/usage**", (r) =>
    r.fulfill(
      json({ days: [], daily_cap: 2000000, today_tokens_out: 12345, total_tokens: 0 }),
    ),
  );
  await page.route("**/api/mcp/tokens", (r) => r.fulfill(json({ items: [] })));
  await page.goto("/admin/settings");
  await expect(page.getByRole("tab").first()).toBeVisible();
}

const TABS = [
  "general",
  "site",
  "seo",
  "cms",
  "translation",
  "email",
  "storage",
  "ai",
];

test("every tab is the same layout, and says so in Vietnamese", async ({
  page,
}) => {
  await openSettings(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(TABS.length);

  for (const [index, name] of TABS.entries()) {
    await tabs.nth(index).click();
    const panel = page.locator("main");
    await expect(panel.getByRole("heading").first()).toBeVisible();

    // Every row is the same grid, so every control starts at the same x. This
    // is the whole claim of "one layout" reduced to a number.
    const columns = await panel
      .locator("div.grid > div:nth-child(2)")
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => (n as HTMLElement).offsetParent !== null)
          .map((n) => Math.round(n.getBoundingClientRect().left)),
      );
    expect(columns.length, `${name}: expected rows`).toBeGreaterThan(0);
    expect(new Set(columns).size, `${name}: controls must share one x`).toBe(1);

    // Nothing on screen may be a raw i18n key or a raw setting id.
    const text = (await panel.innerText()).split("\n");
    const untranslated = text.filter((line) =>
      /^(settings\.|nav\.|common\.|[a-z_]+\.[a-z_.]+$)/.test(line.trim()),
    );
    expect(untranslated, `${name}: untranslated text`).toEqual([]);

    await page.screenshot({
      path: `e2e/__screenshots__/settings-${name}.png`,
      fullPage: true,
    });
  }
});

test("the layout holds on a phone", async ({ page }) => {
  await openSettings(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab").nth(1).click(); // the busiest tab

  // Stacked, not squeezed: nothing may overflow the viewport sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "e2e/__screenshots__/settings-site-390.png",
    fullPage: true,
  });
});
