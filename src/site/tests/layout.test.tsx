import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";
import { SiteContext } from "../app/context";
import { content } from "../app/data/content";
import { getCatalog } from "../app/lib/catalog";
import { emptyBlog } from "../app/lib/blog";
import { BASE_LOCALE } from "../app/lib/locales";
import { translator } from "../app/lib/i18n";

const t = translator(BASE_LOCALE);
import { withReferral } from "../app/lib/links";
import {
  defaultLayout,
  resolveLayout,
  type SiteLayout,
} from "../app/lib/layout";
import { Header } from "../app/components/Header";
import { Footer } from "../app/components/HomeStatic";

function render(layout: SiteLayout, path = "/") {
  const { products, isExample } = getCatalog(content);
  const href = (p: string) => withReferral(p);
  // React writes a <!-- --> marker between adjacent text and elements; it is
  // invisible and would only make these assertions brittle.
  return renderToString(
    <SiteContext
      value={{
        data: content,
        url: new URL(path, "http://site.local"),
        products,
        isExample,
        blog: emptyBlog(),
        layout,
        href,
        locale: BASE_LOCALE,
        locales: [],
        localeHref: (code: string) => `/${code}`,
        t,
      }}
    >
      <Header />
      <Footer href={href} year={2026} layout={layout} />
    </SiteContext>,
  ).replaceAll("<!-- -->", "");
}

// A published slot, in the shape the public API sends.
function item(
  label: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    label,
    description: null,
    link_type: "internal",
    url: "/",
    slug: null,
    open_new_tab: false,
    children: [],
    ...extra,
  };
}

// The copy the header and footer shipped with. Repeated here on purpose: if a
// default ever drifts, this is what catches it.
const SHIPPED = [
  // header, desktop
  'Khám phá <svg class="icon',
  "<strong>Sản phẩm</strong><small>Danh mục, tính năng và bản trải nghiệm</small>",
  "<strong>Đội ngũ &amp; kỹ năng</strong><small>Con người đứng sau ZUKATEK</small>",
  '<a class="nav-link" href="/#team">Đội ngũ &amp; kỹ năng</a>',
  '<a class="nav-link" href="/blog"',
  // header, phone — its own list, with the entry the desktop bar has no room for
  'Cách mua sản phẩm <svg class="icon " aria-hidden="true"><use href="#i-arrow">',
  // header button
  'class="button button-small contact-nav" href="/#contact"',
  // footer
  "Đội ngũ phát triển sản phẩm số<br/>cho cá nhân, nhóm và doanh nghiệp.",
  "<h3>Khám phá ZUKATEK</h3>",
  '<a href="/#about">Về ZUKATEK</a>',
  "<h3>Mua &amp; sử dụng sản phẩm</h3>",
  '<a href="/#collaboration">Cách mua sản phẩm</a>',
  '<div class="footer-message"><h3>Con người đứng sau sản phẩm</h3>',
  "Xem đội ngũ phát triển, kỹ năng<br/>và thành viên phụ trách từng sản phẩm.",
  '© <span id="year">2026</span> ZUKATEK. Cùng tiến về phía trước.',
];

test("with nothing published, the chrome is the markup the site shipped", () => {
  const html = render(defaultLayout(t));
  for (const expected of SHIPPED) {
    assert.ok(html.includes(expected), `lost shipped markup: ${expected}`);
  }
  // An API that answered nothing at all must reach exactly the same place.
  assert.deepEqual(resolveLayout(null, null, t), defaultLayout(t));
  assert.deepEqual(resolveLayout({}, {}, t), defaultLayout(t));
});

test("a published menu replaces the links, keeping the markup around them", () => {
  const layout = resolveLayout(
    {
      header: [
        item("Dịch vụ", {
          url: "/",
          children: [
            item("Tư vấn", {
              url: "/tu-van",
              description: "Gói tư vấn triển khai",
            }),
          ],
        }),
        item("Đối tác", {
          link_type: "external",
          url: "https://partner.example.com/",
          open_new_tab: true,
        }),
      ],
      footer: [
        item("Về chúng tôi", { children: [item("Hồ sơ", { url: "/ho-so" })] }),
      ],
    },
    {},
    t,
  );
  const html = render(layout);

  assert.ok(html.includes("Dịch vụ <svg"));
  assert.ok(
    html.includes(
      "<strong>Tư vấn</strong><small>Gói tư vấn triển khai</small>",
    ),
  );
  assert.ok(html.includes('href="/tu-van"'));
  // An absolute URL keeps its host — the referral helper resolves against the
  // site's own origin and would otherwise drop it — and opens in a new tab.
  assert.ok(
    html.includes(
      '<a class="nav-link" href="https://partner.example.com/" target="_blank" rel="noopener noreferrer"',
    ),
  );
  assert.ok(html.includes("<h3>Về chúng tôi</h3>"));
  assert.ok(html.includes('<a href="/ho-so">Hồ sơ</a>'));
  // Nothing published for the phone menu → it is derived from the desktop one,
  // without the duplicates a dropdown creates.
  assert.deepEqual(
    layout.headerMobile.map((i) => i.href),
    ["/tu-van", "https://partner.example.com/"],
  );
  // What was not published keeps its shipped copy.
  assert.ok(html.includes("Con người đứng sau sản phẩm"));
});

test("entity links become the site's own addresses", () => {
  const layout = resolveLayout(
    {
      header: [
        item("Bài viết", { link_type: "article", url: null, slug: "xin-chao" }),
        item("Trang chủ", { link_type: "page", url: null, slug: "trang-chu" }),
        item("Giới thiệu", {
          link_type: "page",
          url: null,
          slug: "gioi-thieu",
        }),
        item("Chuyên mục", {
          link_type: "category",
          url: null,
          slug: "tin-tuc",
        }),
      ],
    },
    { "cms.home_page_slug": "trang-chu" },
    t,
  );
  assert.deepEqual(
    layout.header.map((i) => i.href),
    [
      "/blog/xin-chao",
      // The page serving "/" is linked as "/", not as a second address for it.
      "/",
      "/gioi-thieu",
      "/blog?category=tin-tuc",
    ],
  );
});

test("an item with nowhere to go is dropped, a heading without one is kept", () => {
  const layout = resolveLayout(
    {
      header: [
        item("Thiếu địa chỉ", { link_type: "article", url: null, slug: null }),
        item("Đường dẫn lạ", { url: "javascript:alert(1)" }),
        item("Nhóm", {
          url: "khong-phai-duong-dan",
          children: [item("Con", { url: "/con" })],
        }),
      ],
    },
    {},
    t,
  );
  assert.deepEqual(
    layout.header.map((i) => i.label),
    ["Nhóm"],
  );
  assert.equal(layout.header[0].href, "");
  assert.ok(!render(layout).includes("javascript:"));
});

test("a malformed payload falls back instead of blanking or throwing", () => {
  const junk: unknown[] = [
    undefined,
    null,
    "",
    42,
    "a string where an object belongs",
    [],
    { header: "nope" },
    { header: [null, 7, "x"] },
    { header: [item("")], footer: [item("   ")] },
    { header: [{ label: "Lạc", children: "không phải mảng" }] },
  ];
  for (const menus of junk) {
    for (const settings of junk) {
      const layout = resolveLayout(menus, settings, t);
      assert.deepEqual(layout, defaultLayout(t), JSON.stringify({ menus }));
      assert.ok(render(layout).includes("Cùng tiến về phía trước."));
    }
  }
});

test("the settings replace the words around the navigation", () => {
  const layout = resolveLayout(
    {},
    {
      "site.brand_tagline": "Một dòng\nHai dòng",
      "site.footer_note_title": "Tiêu đề mới",
      "site.footer_note_text": "Nội dung mới",
      "site.footer_copyright": "Bản quyền {year} của chúng tôi",
      "site.header_cta_label": "Gọi ngay",
      "site.header_cta_url": "/#goi",
    },
    t,
  );
  const html = render(layout);
  assert.ok(html.includes("Một dòng<br/>Hai dòng"));
  assert.ok(html.includes("<h3>Tiêu đề mới</h3>"));
  assert.ok(html.includes("Nội dung mới"));
  assert.ok(
    html.includes('Bản quyền <span id="year">2026</span> của chúng tôi'),
  );
  assert.ok(html.includes('href="/#goi"'));
  assert.ok(html.includes("Gọi ngay"));

  // A button target typed as something else never reaches the document.
  const bad = resolveLayout(
    {},
    { "site.header_cta_url": "javascript:alert(1)" },
    t,
  );
  assert.equal(bad.chrome.ctaHref, "/#contact");
  assert.ok(!render(bad).includes("javascript:"));

  // A copyright line without the placeholder simply shows no year.
  const noYear = resolveLayout({}, { "site.footer_copyright": "ZUKATEK" }, t);
  assert.ok(!render(noYear).includes('id="year"'));
});

test("on the home page the catalogue link stays an in-page anchor", () => {
  assert.ok(render(defaultLayout(t), "/").includes('href="/#products"'));
  const away = render(defaultLayout(t), "/blog");
  assert.ok(away.includes('class="nav-link" href="/products"'));
});

test("every setting on the screen changes something on the page", () => {
  // The point of the settings screen is that nothing on it is decorative, so
  // this walks the keys it writes and checks each one lands.
  const layout = resolveLayout(
    {},
    {
      "app.logo_url": "/assets/custom-logo.png",
      "app.favicon_url": "https://cdn.test/icon.png",
      "app.primary_color": "#ff0066",
      "site.og_image_url": "https://cdn.test/share.png",
      "site.contact_email": "xin-chao@zukatek.test",
      "site.contact_zalo": "https://zalo.me/zukatek",
      "site.contact_phone": "0900 000 000",
      "site.address": "Số 1, Hà Nội",
      "site.social_facebook": "https://facebook.com/zukatek",
      "site.social_github": "https://github.com/zukatek",
      "site.social_linkedin": "javascript:alert(1)",
      "seo.noindex_all": true,
      "seo.google_site_verification": "token-123",
      "seo.analytics_id": "G-ABC123",
      "site.blog_page_size": 12,
      "site.products_page_size": 48,
    },
    t,
  );

  assert.equal(layout.chrome.logoUrl, "/assets/custom-logo.png");
  assert.equal(layout.chrome.contactEmail, "xin-chao@zukatek.test");
  assert.equal(layout.chrome.phone, "0900 000 000");
  assert.equal(layout.chrome.address, "Số 1, Hà Nội");
  // A scheme typed into a settings box never becomes a link.
  assert.deepEqual(
    layout.chrome.social.map((s) => s.key),
    ["facebook", "github"],
  );
  assert.equal(layout.head.faviconUrl, "https://cdn.test/icon.png");
  assert.equal(layout.head.ogImageUrl, "https://cdn.test/share.png");
  assert.equal(layout.head.primaryColor, "#ff0066");
  assert.equal(layout.head.noindexAll, true);
  assert.equal(layout.head.verification, "token-123");
  assert.equal(layout.head.analyticsId, "G-ABC123");
  assert.equal(layout.head.blogPageSize, 12);
  assert.equal(layout.head.productsPageSize, 48);

  const html = render(layout);
  assert.ok(html.includes('src="/assets/custom-logo.png"'));
  assert.ok(html.includes("0900 000 000"));
  assert.ok(html.includes("Số 1, Hà Nội"));
  assert.ok(html.includes('href="https://facebook.com/zukatek"'));
  assert.ok(!html.includes("javascript:"));
});

test("a value that is not a usable setting is ignored, not rendered", () => {
  const layout = resolveLayout(
    {},
    {
      "app.logo_url": "javascript:alert(1)",
      "app.primary_color": "red; content: 'x'",
      "site.blog_page_size": 0,
      "site.products_page_size": "many",
      "seo.noindex_all": "yes",
    },
    t,
  );
  assert.equal(layout.chrome.logoUrl, "", "an unusable logo falls back");
  assert.equal(layout.head.primaryColor, "", "only a hex colour reaches the CSS");
  assert.equal(layout.head.blogPageSize, 9, "a page of zero is not a page");
  assert.equal(layout.head.productsPageSize, 9);
  assert.equal(layout.head.noindexAll, false, "only a real boolean closes a site");
  const html = render(layout);
  assert.ok(html.includes('src="/assets/logo.png"'));
  assert.ok(!html.includes("javascript:"));
});
