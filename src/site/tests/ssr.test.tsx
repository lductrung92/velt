import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";
import { render } from "../app/entry-server";
import { App } from "../app/App";
import { content } from "../app/data/content";
import { getCatalog, readFilters, selectProducts } from "../app/lib/catalog";
import { demoLink, safeUrl, withReferral } from "../app/lib/links";
import type { SiteContent } from "../app/types";

test("server renders real page content, filters and metadata without browser globals", () => {
  const home = render("/?ref=member-1");
  assert.equal(home.status, 200);
  assert.match(home.html, /Đội ngũ phát triển/);
  assert.match(home.html, /Thành viên 01/);
  assert.match(home.html, /data-globe-motion="static"/);
  assert.match(home.html, /data-globe-frame="0"/);
  assert.equal((home.html.match(/data-globe-member=/g) || []).length, 4);
  assert.match(home.html, /Mở hồ sơ Thành viên 04 trên địa cầu/);
  assert.equal((home.html.match(/class="catalog-card"/g) || []).length, 6);
  const catalog = render("/products?q=so%20ghi%20chu&ref=member-1");
  // The list page renders the `listing` card; the home page above still uses
  // the plain one, which is why both classes are asserted in this test.
  assert.equal(
    (catalog.html.match(/class="catalog-listing-card"/g) || []).length,
    1,
  );
  assert.match(catalog.html, /Sổ ghi chú/);
  const detail = render("/products/example-1");
  assert.match(detail.title, /ZUKATEK.*Minh họa/);
  assert.match(detail.html, /Liên kết tạm để xem bố cục/);
  assert.equal(render("/products/missing").status, 404);
  assert.equal(render("/unknown-page").status, 404);
  assert.equal(render("/product.html?id=example-1").status, 200);
});

test("hero SSR keeps the independent-product illustration and all four audiences before hydration", () => {
  const { html } = render("/");
  assert.match(html, /data-hero-motion="static"/);
  assert.match(html, /data-hero-frame="0"/);
  for (const audience of ["Cá nhân", "Nhóm", "Hộ kinh doanh", "Doanh nghiệp"]) {
    assert.ok(html.includes(audience));
  }
  assert.match(html, /Mỗi sản phẩm, một trải nghiệm riêng/);
  assert.match(html, /Minh họa hệ sinh thái sản phẩm Zukatek/);
  assert.doesNotMatch(html, /<audio|<video/);
});

test("100 real products replace examples and SSR pagination clamps malformed queries", () => {
  const data: SiteContent = {
    ...content,
    products: Array.from({ length: 100 }, (_, i) => ({
      id: `p-${i}`,
      name: `Sản phẩm ${i}`,
      summary: "Công cụ cho nhóm",
      category: i % 2 ? "Cộng tác" : "Quản lý",
      featured: i < 10,
    })),
  };
  const { products, isExample } = getCatalog(data);
  assert.equal(isExample, false);
  assert.equal(products.length, 100);
  assert.equal(
    selectProducts(products, { category: "Cộng tác", query: "cong cu nhom" })
      .length,
    50,
  );
  const markup = renderToString(
    <App url="/products?page=999" year={2026} data={data} />,
  );
  assert.equal((markup.match(/class="catalog-listing-card"/g) || []).length, 1);
  assert.match(markup, /Hiển thị 100–100 trong 100 sản phẩm/);
  assert.equal(
    readFilters(new URL("http://local/products?page=Infinity"), products).page,
    1,
  );
  assert.equal(
    readFilters(new URL("http://local/products?page=-7"), products).page,
    1,
  );
});

test("links retain referrals and reject unsafe schemes; SSR text is escaped", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(
    demoLink({ id: "a", name: "", summary: "", demoUrl: "data:text/html,hi" }),
    "",
  );
  assert.match(
    withReferral("/products?q=note", content.members[0]),
    /ref=member-1/,
  );
  assert.match(
    demoLink(
      {
        id: "a",
        name: "",
        summary: "",
        demoUrl: "https://example.com",
        forwardReferral: true,
      },
      content.members[0],
    ),
    /ref=member-1/,
  );
  const data = {
    ...content,
    products: [
      {
        id: "a",
        name: "<img src=x onerror=alert(1)>",
        summary: "Safe text",
        demoUrl: "javascript:alert(1)",
      },
    ],
  };
  const markup = renderToString(
    <App url="/products/a" year={2026} data={data} />,
  );
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /href="javascript:/);
});
