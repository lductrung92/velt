import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../app/entry-server";
import { emptyBlog } from "../app/lib/blog";
import { TABLES } from "../app/lib/i18n";
import { content } from "../app/data/content";
import type { SiteContent } from "../app/types";
import {
  allLocales,
  alternatesFor,
  BASE_LOCALE,
  splitLocale,
  withLocale,
  withoutLocale,
} from "../app/lib/locales";

const EXTRAS = ["en"];

test("the base language keeps the bare address, the others take a prefix", () => {
  assert.deepEqual(splitLocale("/blog", EXTRAS), {
    locale: "vi",
    path: "/blog",
  });
  assert.deepEqual(splitLocale("/en/blog", EXTRAS), {
    locale: "en",
    path: "/blog",
  });
  assert.deepEqual(splitLocale("/en", EXTRAS), { locale: "en", path: "/" });
  assert.deepEqual(splitLocale("/EN/blog", EXTRAS), {
    locale: "en",
    path: "/blog",
  });
  // A language nobody configured is a path segment, not a language — otherwise
  // /en/... would start swallowing real pages the day someone adds a route.
  assert.deepEqual(splitLocale("/eo/blog", EXTRAS), {
    locale: "vi",
    path: "/eo/blog",
  });
  assert.deepEqual(splitLocale("/products/en", EXTRAS), {
    locale: "vi",
    path: "/products/en",
  });
  assert.deepEqual(splitLocale("/", []), { locale: "vi", path: "/" });

  assert.equal(withLocale("/blog", BASE_LOCALE), "/blog");
  assert.equal(withLocale("/blog", "en"), "/en/blog");
  assert.equal(withLocale("/", "en"), "/en");
  // The referral and the paging survive a language switch.
  assert.equal(
    withLocale("/blog?page=2&ref=m1", "en"),
    "/en/blog?page=2&ref=m1",
  );
  assert.equal(withLocale("/products#top", "en"), "/en/products#top");
  // An absolute URL is somebody else's address; it keeps its own language.
  assert.equal(withLocale("https://x.test/a", "en"), "https://x.test/a");
  assert.equal(withoutLocale("/en/blog", EXTRAS), "/blog");
  assert.deepEqual(allLocales(EXTRAS), ["vi", "en"]);
});

test("every page lists every language, itself included, with one x-default", () => {
  const alts = alternatesFor("/blog", EXTRAS);
  assert.deepEqual(alts, [
    { locale: "vi", href: "/blog", xDefault: true },
    { locale: "en", href: "/en/blog", xDefault: false },
  ]);
  // Content whose slug is translated points at the slug, not at the prefix.
  const translated = alternatesFor("/blog/xin-chao", EXTRAS, {
    vi: "/blog/xin-chao",
    en: "/blog/hello",
  });
  assert.deepEqual(
    translated.map((a) => a.href),
    ["/blog/xin-chao", "/en/blog/hello"],
  );
  // One language configured → one entry, and it is still the x-default.
  assert.deepEqual(alternatesFor("/", []), [
    { locale: "vi", href: "/", xDefault: true },
  ]);
});

// Everything a visitor can click has to stay in the language being read; one
// link without the prefix drops them back into Vietnamese mid-visit.
function internalLinks(html: string): string[] {
  return (
    [...html.matchAll(/<a\s[^>]*>/g)]
      .map((match) => match[0])
      // The switcher's own entries point at the OTHER languages on purpose; they
      // are the one place a link may leave the current one, and they say so with
      // hreflang.
      .filter((tag) => !/hreflang=/i.test(tag))
      .map((tag) => /href="([^"]*)"/.exec(tag)?.[1] ?? "")
      .filter(
        (href) =>
          href.startsWith("/") &&
          !href.startsWith("/assets/") &&
          !href.startsWith("//"),
      )
  );
}

test("in another language, every link on the page carries the prefix", () => {
  const page = render("/", emptyBlog(), undefined, undefined, undefined, "en", [
    "en",
  ]);
  const links = internalLinks(page.html);
  assert.ok(
    links.length > 10,
    `expected a page full of links, got ${links.length}`,
  );
  const stray = links.filter((href) => !href.startsWith("/en"));
  assert.deepEqual(
    stray,
    [],
    "these links would drop the reader back into Vietnamese",
  );
  assert.equal(page.lang, "en");
  assert.equal(page.canonical, "/en");

  // And in the base language nothing gains a prefix.
  const base = render("/");
  assert.equal(base.lang, "vi");
  assert.ok(internalLinks(base.html).every((href) => !href.startsWith("/en/")));
});

test("the switcher appears only when a second language is configured", () => {
  const alone = render("/");
  assert.ok(!alone.html.includes("lang-switch"));
  assert.ok(!alone.html.includes("mobile-lang"));

  const bilingual = render(
    "/products",
    emptyBlog(),
    undefined,
    undefined,
    undefined,
    "vi",
    ["en"],
  );
  assert.ok(bilingual.html.includes("lang-switch"));
  assert.ok(bilingual.html.includes("mobile-lang"));
  assert.ok(bilingual.html.includes("Tiếng Việt"));
  assert.ok(bilingual.html.includes("English"));
  // Each entry says which language it leads to, and the current one says so.
  assert.ok(
    bilingual.html.includes('hrefLang="en"') ||
      bilingual.html.includes('hreflang="en"'),
  );
  assert.ok(bilingual.html.includes('href="/en/products"'));
  assert.deepEqual(
    bilingual.alternates.map((a) => a.href),
    ["/products", "/en/products"],
  );
});

test("switching language on an article follows its translated slug", () => {
  const blog = {
    ...emptyBlog(),
    article: {
      slug: "xin-chao",
      title: "Xin chào",
      excerpt: null,
      cover_url: null,
      published_at: "2026-01-01T00:00:00Z",
      locale: "vi",
      body_html: "<p>…</p>",
      seo: {},
      alternates: [
        { locale: "vi", slug: "xin-chao" },
        { locale: "en", slug: "hello" },
      ],
    },
  } as ReturnType<typeof emptyBlog>;
  const page = render(
    "/blog/xin-chao",
    blog,
    undefined,
    undefined,
    undefined,
    "vi",
    ["en"],
  );
  assert.deepEqual(
    page.alternates.map((a) => `${a.locale} ${a.href}`),
    ["vi /blog/xin-chao", "en /en/blog/hello"],
  );
  assert.ok(
    page.html.includes('href="/en/blog/hello"'),
    "the switcher must offer the article's own English address",
  );
  assert.equal(page.canonical, "/blog/xin-chao");
});

test("nothing the site says in Vietnamese survives into the English page", () => {
  // The guard against a component that still holds its own words: every value
  // the dictionary translates must be gone from the English render. Content
  // from the API is deliberately not checked — an untranslated product keeps
  // its Vietnamese name, which is the fallback working, not a bug.
  const { vi, en } = TABLES;
  const untranslated = (Object.keys(vi) as (keyof typeof vi)[]).filter(
    (key) =>
      vi[key] !== en[key] && /[À-ỹ]/.test(vi[key]) && vi[key].trim().length > 3,
  );
  assert.ok(
    untranslated.length > 200,
    `expected a full dictionary, got ${untranslated.length}`,
  );

  // Content with no Vietnamese in it, so what remains can only be the site's
  // own words. The sample catalogue is written in Vietnamese by design, and a
  // product keeps its name in every language.
  const data: SiteContent = {
    ...content,
    showProductExamples: false,
    products: [
      {
        id: "alpha",
        name: "Alpha",
        summary: "A product.",
        category: "Ops",
        audience: "Teams",
        status: "launched",
        example: false,
      },
    ],
    members: [
      {
        id: "ann",
        name: "Ann Lee",
        role: "Engineer",
        bio: "Builds things.",
        skills: ["Go"],
        links: [],
        image: "",
        color: "blue",
        email: "",
        zalo: "",
      },
    ],
  };

  for (const path of ["/", "/products", "/products/alpha", "/blog"]) {
    const html = render(path, emptyBlog(), data, undefined, undefined, "en", [
      "en",
    ]).html;
    const leaked = untranslated.filter((key) => html.includes(vi[key].trim()));
    assert.deepEqual(
      leaked,
      [],
      `${path} still shows Vietnamese the dictionary has an English value for`,
    );
  }
});
