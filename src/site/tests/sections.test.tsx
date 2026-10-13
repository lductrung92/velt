import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";
import { SiteContext } from "../app/context";
import { content } from "../app/data/content";
import { getCatalog } from "../app/lib/catalog";
import { emptyBlog } from "../app/lib/blog";
import { BASE_LOCALE } from "../app/lib/locales";
import { DEFAULT_LAYOUT } from "../app/lib/layout";
import { withReferral } from "../app/lib/links";
import { SectionRenderer } from "../app/components/SectionRenderer";
import type { PublicSection } from "../app/types";

function render(sections: PublicSection[]) {
  const { products, isExample } = getCatalog(content);
  return renderToString(
    <SiteContext
      value={{
        data: content,
        url: new URL("http://site.local/"),
        products,
        isExample,
        blog: emptyBlog(),
        layout: DEFAULT_LAYOUT,
        locale: BASE_LOCALE,
        locales: [],
        localeHref: (code: string) => `/${code}`,
        href: (path: string) => withReferral(path),
      }}
    >
      <SectionRenderer sections={sections} />
    </SiteContext>,
  );
}
const section = (
  type: string,
  config?: unknown,
  sort_order = 1,
): PublicSection => ({ type, sort_order, config });

// The strings below are the copy the page shipped with. They are repeated here
// on purpose: if a default ever drifts, this test is what catches it.
const defaults: Record<string, string[]> = {
  audience_picker: [
    '<h2 id="about-title">Sản phẩm phù hợp với nhu cầu của bạn</h2>',
    "<p>Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp.</p>",
    "<h3>Dành cho cá nhân</h3>",
    "<p>Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.</p>",
    "<h3>Dành cho nhóm</h3>",
    "<p>Tìm sản phẩm giúp nhóm tổ chức công việc, chia sẻ tài liệu và theo dõi tiến độ trong cùng một không gian.</p>",
    "<h3>Dành cho doanh nghiệp</h3>",
    "<p>Xem các sản phẩm phục vụ quản lý và vận hành. Tìm hiểu tính năng, phạm vi sử dụng và chi phí trước khi mua.</p>",
    'class="card-art art-individual"',
    'class="card-art art-group"',
    'class="card-art art-business"',
    'href="/#contact"',
    'data-audience="Cá nhân"',
    'data-audience="Nhóm"',
    'data-audience="Doanh nghiệp"',
    "Tư vấn cho cá nhân ",
    "Tư vấn cho nhóm ",
    "Tư vấn cho doanh nghiệp ",
  ],
  product_grid: [
    '<h2 id="products-title">Sản phẩm của ZUKATEK</h2>',
    "<p>Khám phá tính năng, mở bản demo và nhận tư vấn về sản phẩm bạn quan tâm.</p>",
    "Xem tất cả sản phẩm ",
    "Khám phá toàn bộ danh mục ",
  ],
  team: [
    '<h2 id="team-title">Đội ngũ phát triển</h2>',
    "<p>Những người trực tiếp xây dựng và phát triển sản phẩm Zukatek.</p>",
  ],
  buying_steps: [
    '<h2 id="collaboration-title">Chọn mua sản phẩm ZUKATEK</h2>',
    "<p>Ba bước để chọn mua sản phẩm phù hợp với nhu cầu của bạn.</p>",
    '<span class="step-number">01</span>',
    "<h3>Chọn sản phẩm</h3>",
    "<p>Xem danh mục, tính năng và đối tượng sử dụng để tìm sản phẩm phù hợp.</p>",
    '<span class="step-number">02</span>',
    "<h3>Trải nghiệm bản demo</h3>",
    "<p>Mở bản trải nghiệm riêng của sản phẩm và kiểm tra các tính năng bạn cần.</p>",
    '<span class="step-number">03</span>',
    "<h3>Liên hệ mua sản phẩm</h3>",
    "<p>Nhận tư vấn về giá, phạm vi sử dụng và cách triển khai từ người giới thiệu hoặc ZUKATEK.</p>",
  ],
  contact_form: [
    '<h2 id="contact-title">Cần tư vấn sản phẩm?<br/>Liên hệ ZUKATEK.</h2>',
    "<p>Nhận tư vấn về tính năng, giá và cách triển khai<br/>từ người giới thiệu hoặc đội ngũ ZUKATEK.</p>",
    // The sample content has no contact channel, so the note keeps the wording
    // the page already shows when there is nothing to email.
    '<p class="form-note" id="form-note">Lời nhắn được tạo trên thiết bị để bạn sao chép hoặc tải về; chưa được gửi đến ZUKATEK.</p>',
  ],
};

test("a section with no config renders the copy the page already shipped", () => {
  for (const [type, copy] of Object.entries(defaults)) {
    const html = render([section(type)]);
    for (const expected of copy) {
      assert.ok(
        html.includes(expected),
        `${type} lost its default copy: ${expected}`,
      );
    }
  }
  const grid = render([section("product_grid")]);
  assert.equal((grid.match(/class="catalog-card"/g) || []).length, 6);
});

test("a partial config overrides only the fields it names", () => {
  const audience = render([
    section("audience_picker", {
      title: "Chọn theo nhu cầu",
      items: [{ headline: "Cho riêng bạn" }],
    }),
  ]);
  assert.match(audience, /<h2 id="about-title">Chọn theo nhu cầu<\/h2>/);
  assert.match(audience, /<h3>Cho riêng bạn<\/h3>/);
  // The item keeps the body, the label and the artwork of the first default.
  assert.ok(
    audience.includes(
      "Khám phá các công cụ phục vụ công việc hằng ngày: ghi chú, sắp xếp thông tin và quản lý công việc cá nhân.",
    ),
  );
  assert.ok(audience.includes('class="card-art art-individual"'));
  assert.ok(audience.includes('data-audience="Cá nhân"'));
  assert.ok(
    audience.includes(
      "Sản phẩm số cho công việc cá nhân, phối hợp trong nhóm và vận hành doanh nghiệp.",
    ),
  );

  const grid = render([section("product_grid", { limit: 2 })]);
  assert.equal((grid.match(/class="catalog-card"/g) || []).length, 2);
  assert.ok(grid.includes("Sản phẩm của ZUKATEK"));

  const steps = render([
    section("buying_steps", { steps: [{ title: "Một bước" }] }),
  ]);
  assert.ok(steps.includes('<span class="step-number">01</span>'));
  assert.ok(steps.includes("<h3>Một bước</h3>"));
  assert.ok(steps.includes("Chọn mua sản phẩm ZUKATEK"));

  const team = render([section("team", { limit: 1, subtitle: "Bốn người" })]);
  assert.equal((team.match(/class="member-card"/g) || []).length, 1);
  assert.ok(team.includes("<p>Bốn người</p>"));
  assert.ok(team.includes("Đội ngũ phát triển"));

  const contact = render([
    section("contact_form", { note: "Chỉ là bản nháp." }),
  ]);
  assert.ok(contact.includes("Chỉ là bản nháp."));
  assert.ok(contact.includes("Cần tư vấn sản phẩm?<br/>Liên hệ ZUKATEK."));
});

test("a malformed config falls back instead of blanking or throwing", () => {
  const junk: unknown[] = [
    undefined,
    null,
    "",
    "   ",
    42,
    "a string where an object belongs",
    [],
    [1, 2, 3],
    { title: "", subtitle: null, items: "nope", steps: {}, limit: "many" },
    { title: 7, items: [null, "x", 9], steps: [null], limit: -3 },
    { items: [{}, {}, {}, {}], steps: [{}, {}, {}, {}, {}] },
    { email: "x", zalo: "javascript:alert(1)", cta_href: 0 },
  ];
  for (const config of junk) {
    for (const [type, copy] of Object.entries(defaults)) {
      const html = render([section(type, config)]);
      assert.ok(
        html.includes(copy[0]),
        `${type} lost its heading on ${JSON.stringify(config)}`,
      );
    }
  }
  // Four empty audience items still get artwork and a usable link.
  const filled = render([
    section("audience_picker", { items: [{}, {}, {}, {}] }),
  ]);
  assert.equal((filled.match(/class="feature-card"/g) || []).length, 4);
  assert.equal(
    (filled.match(/class="card-art art-individual"/g) || []).length,
    2,
  );
  // A scheme typed into the console never reaches the document.
  assert.doesNotMatch(
    render([
      section("audience_picker", {
        items: [{ cta_href: "javascript:alert(1)" }],
      }),
    ]),
    /javascript:/,
  );
  assert.doesNotMatch(
    render([section("contact_form", { zalo: "javascript:alert(1)" })]),
    /javascript:/,
  );
});

test("sections render in sort_order and an unknown type renders nothing", () => {
  const html = render([
    { type: "contact_form", sort_order: 3 },
    { type: "buying_steps", sort_order: 2 },
    { type: "audience_picker", sort_order: 1 },
  ]);
  assert.ok(html.indexOf('id="about"') < html.indexOf('id="collaboration"'));
  assert.ok(html.indexOf('id="collaboration"') < html.indexOf('id="contact"'));
  assert.equal(
    render([
      { type: "testimonial_wall", sort_order: 1, config: { title: "Mới" } },
    ]),
    "",
  );
  assert.ok(
    render([
      { type: "testimonial_wall", sort_order: 2 },
      { type: "buying_steps", sort_order: 1 },
    ]).includes("Chọn mua sản phẩm ZUKATEK"),
  );
  assert.equal(render([]), "");
});

test("hero and faq take their copy from a config, and fall back when it is absent", () => {
  // These two were wired last: they rendered their own hard-coded copy and
  // silently ignored the console's form, which is worse than having no form.
  const withConfig = render([
    {
      type: "hero",
      sort_order: 0,
      config: { eyebrow: "NHÃN RIÊNG", heading: "Trên\nDưới" },
      data: null,
    },
    {
      type: "faq",
      sort_order: 1,
      config: {
        title: "Hỏi riêng",
        items: [{ question: "Câu hỏi riêng?", answer_html: "Trả lời." }],
      },
      data: null,
    },
  ]);
  assert.match(withConfig, /NHÃN RIÊNG/);
  assert.match(withConfig, /Trên<br\/>Dưới/); // a newline becomes the <br /> the markup had
  assert.match(withConfig, /Hỏi riêng/);
  assert.match(withConfig, /Câu hỏi riêng\?/);

  const bare = render([
    { type: "hero", sort_order: 0, config: null, data: null },
    { type: "faq", sort_order: 1, config: "rác", data: null },
  ]);
  assert.match(bare, /HỆ SINH THÁI SẢN PHẨM ZUKATEK/);
  assert.match(bare, /Câu hỏi thường gặp/);
});
