import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";

import { pageGroup, resolveRoute } from "../app/App";
import { SiteContext } from "../app/context";
import { content } from "../app/data/content";
import { emptyBlog } from "../app/lib/blog";
import { getCatalog } from "../app/lib/catalog";
import { translator } from "../app/lib/i18n";
import { withReferral } from "../app/lib/links";
import { BASE_LOCALE } from "../app/lib/locales";
import { defaultLayout } from "../app/lib/layout";
import {
  emptySlots,
  resolveRegions,
  slotsForGroup,
  type PageGroup,
  type RegionBlock,
} from "../app/lib/regions";
import { RegionSlot } from "../app/components/RegionSlot";

const t = translator(BASE_LOCALE);

function render(blocks: RegionBlock[]): string {
  const { products, isExample } = getCatalog(content);
  const href = (p: string) => withReferral(p);
  return renderToString(
    <SiteContext
      value={{
        data: content,
        url: new URL("/", "http://site.local"),
        products,
        isExample,
        blog: emptyBlog(),
        layout: defaultLayout(t),
        regions: emptySlots(),
        href,
        locale: BASE_LOCALE,
        locales: [],
        localeHref: (code: string) => `/${code}`,
        t,
      }}
    >
      <RegionSlot name="footer" blocks={blocks} />
    </SiteContext>,
  ).replaceAll("<!-- -->", "");
}

/** The blocks a page of this group ends up with, straight from the API shape. */
function walk(raw: unknown, group: PageGroup) {
  return slotsForGroup(resolveRegions(raw), group);
}

function richText(html: string) {
  return { kind: "widget", widget_type: "rich_text", config: { html } };
}

test("a region nobody configured renders nothing at all", () => {
  // The whole bargain of these slots: a site that never opens the Appearance
  // screen must look exactly as it did before they existed.
  assert.equal(render([]), "");
  assert.deepEqual(resolveRegions(null), {});
  assert.deepEqual(walk(null, "blog_detail"), emptySlots());
  assert.equal(render(walk(null, "home").footer), "");
});

test("a static widget renders from its config, which has no data beside it", () => {
  // rich_text and cta_banner resolve to null data — their config IS the
  // content. Sending only `data` was a real bug: both drew nothing.
  const regions = walk(
    {
      common: {
        footer: [
          {
            kind: "widget",
            widget_type: "rich_text",
            config: { html: "<p>Giờ làm việc: 8h–17h</p>", width: "narrow" },
            data: null,
          },
        ],
      },
    },
    "home",
  );
  const html = render(regions.footer);
  assert.match(html, /Giờ làm việc: 8h–17h/);
  assert.match(html, /region-width-narrow/);
});

test("a list widget renders from its data and its title from its config", () => {
  const regions = walk(
    {
      common: {
        footer: [
          {
            kind: "widget",
            widget_type: "articles_list",
            config: { title: "Bài mới", limit: 2 },
            data: { items: [{ slug: "chao-ban", title: "Chào bạn" }] },
          },
        ],
      },
    },
    "blog_list",
  );
  const html = render(regions.footer);
  assert.match(html, /Bài mới/);
  assert.match(html, /Chào bạn/);
  assert.match(html, /\/blog\/chao-ban/);
});

test("an empty menu block is dropped rather than drawn as an empty nav", () => {
  assert.deepEqual(
    resolveRegions({ common: { footer: [{ kind: "menu", items: [] }] } }),
    {},
  );
});

test("a widget type this build cannot draw is dropped, not guessed at", () => {
  // Dropped rather than kept-and-skipped: a block nothing can draw must not
  // make the slot count as configured, or the slot renders an empty wrapper
  // into the header — and the walk stops at a group that declared nothing.
  const regions = walk(
    { common: { footer: [{ kind: "widget", widget_type: "from_the_future" }] } },
    "home",
  );
  assert.deepEqual(regions.footer, []);
  assert.equal(render(regions.footer), "");
});

test("a menu block links through the site's own URL layout", () => {
  const regions = walk(
    {
      common: {
        footer: [
          {
            kind: "menu",
            items: [
              { label: "Liên hệ", url: "/#contact", open_new_tab: false },
              { label: "Đối tác", url: "https://x.test", open_new_tab: true },
            ],
          },
        ],
      },
    },
    "home",
  );
  const html = render(regions.footer);
  assert.match(html, /Liên hệ/);
  assert.match(html, /https:\/\/x\.test/);
  assert.match(html, /target="_blank"/);
});

/* --- The walk up the page tree --- */

test("a slot a page's group never declares comes from its nearest ancestor", () => {
  const raw = { common: { footer: [richText("<p>chung</p>")] } };
  for (const group of [
    "home",
    "product_list",
    "product_detail",
    "blog_list",
    "blog_detail",
    "not_found",
  ] as PageGroup[]) {
    assert.match(render(walk(raw, group).footer), /chung/, group);
  }
});

test("a child's list REPLACES its ancestor's rather than adding to it", () => {
  // Override, not merge. Merging would leave no way to say "not this block on
  // this page", and nothing on the editor's screen would explain where a block
  // had come from.
  const raw = {
    common: { footer: [richText("<p>chung</p>")] },
    blog: { footer: [richText("<p>blog</p>")] },
  };
  const html = render(walk(raw, "blog_detail").footer);
  assert.match(html, /blog/);
  assert.doesNotMatch(html, /chung/, "the ancestor's list is replaced, not kept");
  assert.equal(walk(raw, "blog_detail").footer.length, 1);
  // A sibling branch is untouched by it.
  assert.match(render(walk(raw, "home").footer), /chung/);
});

test("the nearest ancestor wins, not the furthest", () => {
  const raw = {
    common: { footer: [richText("<p>chung</p>")] },
    blog: { footer: [richText("<p>blog</p>")] },
    blog_detail: { footer: [richText("<p>bài</p>")] },
  };
  const html = render(walk(raw, "blog_detail").footer);
  assert.match(html, /bài/);
  assert.doesNotMatch(html, /blog<|chung/);
  assert.match(render(walk(raw, "blog_list").footer), /blog/);
});

test("an empty list at a child falls through to the ancestor", () => {
  // The editor emptying a group's slot means "I have nothing to say here", not
  // "show nothing here" — the same contract an absent group keeps.
  const raw = {
    common: { footer: [richText("<p>chung</p>")] },
    blog_detail: { footer: [] },
  };
  assert.match(render(walk(raw, "blog_detail").footer), /chung/);

  // And a list whose every block was undrawable is empty for this purpose too.
  const undrawable = {
    common: { footer: [richText("<p>chung</p>")] },
    blog: { footer: [{ kind: "widget", widget_type: "from_the_future" }] },
  };
  assert.match(render(walk(undrawable, "blog_detail").footer), /chung/);
});

test("a grouping node is inherited by both its children and matches no page", () => {
  // `products` is why "every product page" is one list instead of the same
  // list entered twice.
  const raw = { products: { header: [richText("<p>sản phẩm</p>")] } };
  assert.equal(walk(raw, "product_list").header.length, 1);
  assert.equal(walk(raw, "product_detail").header.length, 1);
  assert.deepEqual(walk(raw, "blog_detail").header, []);
  assert.deepEqual(walk(raw, "home").header, []);
});

test("slots do not leak between each other on the way up", () => {
  const raw = {
    common: { header: [richText("<p>đầu</p>")] },
    blog_detail: { sidebar_left: [richText("<p>cột</p>")] },
  };
  const slots = walk(raw, "blog_detail");
  assert.equal(slots.header.length, 1, "header still comes from common");
  assert.equal(slots.sidebar_left.length, 1);
  assert.deepEqual(slots.footer, []);
  assert.deepEqual(slots.after_article, []);
});

/* --- The group a page is in --- */

test("the page group follows the route the site already resolved", () => {
  const group = (path: string) =>
    pageGroup(resolveRoute(new URL(path, "http://site.local")));
  const { products } = getCatalog(content);

  assert.equal(group("/"), "home");
  assert.equal(group("/index.html"), "home");
  assert.equal(group("/products"), "product_list");
  assert.equal(group("/products/"), "product_list");
  assert.equal(group("/products.html"), "product_list");
  assert.equal(group(`/products/${products[0].id}`), "product_detail");
  assert.equal(group("/blog"), "blog_list");
  assert.equal(group("/blog/"), "blog_list");
  assert.equal(group("/blog/chao-ban"), "blog_detail");
  assert.equal(group("/ai-do"), "not_found");

  // A product slug nothing answers to renders NotFound, so it is grouped as
  // the page the visitor actually gets.
  assert.equal(group("/products/khong-co-that"), "not_found");
});
