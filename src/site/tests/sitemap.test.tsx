import assert from "node:assert/strict";
import { test } from "node:test";
import { robots, sitemap } from "../app/lib/sitemap.server";
import { purge } from "../app/lib/cache.server";

const ORIGIN = "https://zukatek.test";

// A fake API that answers in whatever language the URL asks for, so the sitemap
// can be checked for the thing that actually matters: that each language is
// listed from its OWN data, slugs included.
function api(options: { locales?: string; down?: boolean } = {}): typeof fetch {
  return (async (input: string) => {
    if (options.down) throw new Error("API down");
    const url = String(input);
    const en = url.includes("locale=en");
    const body = (value: unknown) => ({
      ok: true,
      status: 200,
      json: async () => value,
    });
    if (url.includes("/public/settings")) {
      return body({
        "site.cache_ttl_seconds": 0,
        "translation.enabled": true,
        "translation.locales": options.locales ?? "en",
      });
    }
    if (url.includes("/public/cms/version")) return body({ version: "1" });
    if (url.includes("/public/products")) {
      return body({
        items: [
          {
            slug: en ? "compact-store" : "kho-gon",
            name: en ? "Compact Store" : "Kho Gọn",
            summary: "",
            cover_url: null,
            lifecycle: "launched",
            is_featured: false,
            audience: [],
            platforms: [],
            categories: [],
          },
        ],
        total: 1,
      });
    }
    if (url.includes("/public/members")) return body({ items: [], total: 0 });
    if (url.includes("/public/cms/articles")) {
      return body({
        items: [
          {
            slug: en ? "hello" : "xin-chao",
            title: en ? "Hello" : "Xin chào",
            excerpt: null,
            cover_url: null,
            published_at: "2026-01-02T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 9,
      });
    }
    return body({});
  }) as unknown as typeof fetch;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

test("the sitemap lists each language from its own data", async () => {
  purge();
  const xml = await sitemap(ORIGIN, api());
  assert.deepEqual(locs(xml), [
    `${ORIGIN}/`,
    `${ORIGIN}/products`,
    `${ORIGIN}/blog`,
    `${ORIGIN}/products/kho-gon`,
    `${ORIGIN}/blog/xin-chao`,
    // The English entries carry the English slugs — the addresses that language
    // actually serves, not a prefix glued onto the Vietnamese ones.
    `${ORIGIN}/en`,
    `${ORIGIN}/en/products`,
    `${ORIGIN}/en/blog`,
    `${ORIGIN}/en/products/compact-store`,
    `${ORIGIN}/en/blog/hello`,
  ]);

  // The routes that exist at the same path in every language declare the set;
  // a record's languages are declared by the page itself, where its other slugs
  // are known.
  assert.ok(
    xml.includes(
      `<loc>${ORIGIN}/products</loc><xhtml:link rel="alternate" hreflang="vi" href="${ORIGIN}/products"/><xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}/en/products"/><xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/products"/>`,
    ),
  );
  assert.ok(
    xml.includes(
      `<loc>${ORIGIN}/blog/xin-chao</loc><lastmod>2026-01-02T00:00:00Z</lastmod></url>`,
    ),
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?><urlset/);
});

test("one language configured means one set of addresses", async () => {
  purge();
  const xml = await sitemap(ORIGIN, api({ locales: "" }));
  assert.deepEqual(locs(xml), [
    `${ORIGIN}/`,
    `${ORIGIN}/products`,
    `${ORIGIN}/blog`,
    `${ORIGIN}/products/kho-gon`,
    `${ORIGIN}/blog/xin-chao`,
  ]);
  assert.ok(!xml.includes("/en"));
});

test("an API that is down still produces a usable sitemap", async () => {
  purge();
  const xml = await sitemap(ORIGIN, api({ down: true }));
  const found = locs(xml);
  // The three routes that exist without any data are always there, and the
  // languages are unknown, so nothing is prefixed.
  assert.ok(found.includes(`${ORIGIN}/`));
  assert.ok(found.includes(`${ORIGIN}/products`));
  assert.ok(found.includes(`${ORIGIN}/blog`));
  assert.ok(!xml.includes("/en/"));
  // Records fall back to the last content that loaded — the content loader
  // keeps it for exactly this, and a sitemap of yesterday's pages is worth
  // more than a sitemap of none.
  assert.ok(found.length >= 3);
});

test("robots points at the sitemap on the host that served it", async () => {
  purge();
  assert.equal(
    await robots(ORIGIN, api()),
    `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
  );
});

test("a site that is not launched closes robots.txt entirely", async () => {
  purge();
  const closed = (async (input: string) => {
    const url = String(input);
    return {
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/public/settings") ? { "seo.noindex_all": true } : {},
    };
  }) as unknown as typeof fetch;
  assert.equal(await robots(ORIGIN, closed), `User-agent: *\nDisallow: /\n`);
  // An unreachable API must not close a site that is open.
  assert.match(await robots(ORIGIN, api({ down: true })), /Allow: /);
});
