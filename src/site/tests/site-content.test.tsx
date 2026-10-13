import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSiteContent } from "../app/lib/site.server";

const product = {
  slug: "kho-gon",
  name: "Kho Gọn",
  summary: "Quản lý tồn kho.",
  cover_url: "/api/files/cover.png",
  lifecycle: "launched",
  is_featured: true,
  audience: ["business"],
  platforms: ["web", "android"],
  categories: [{ slug: "van-hanh", name: "Vận hành" }],
};
const member = {
  slug: "an-nguyen",
  full_name: "An Nguyễn",
  role: "Backend",
  bio: "",
  avatar_url: null,
  email: null,
  zalo: null,
  links: [],
  skills: ["Go"],
};

function stub(payloads: Record<string, unknown>, fail = false): typeof fetch {
  return (async (input: string) => {
    if (fail) throw new Error("API down");
    const key = Object.keys(payloads).find((k) => String(input).includes(k));
    return {
      ok: true,
      status: 200,
      json: async () => payloads[key!],
    };
  }) as unknown as typeof fetch;
}

const payloads = {
  "/public/products": { items: [product], total: 1 },
  "/public/members": { items: [member], total: 1 },
  "/public/settings": { "app.name": "Zukatek" },
};

test("API codes become the words the console shows", async () => {
  // The console calls these "Doanh nghiệp" and "Đã ra mắt". One product must
  // not be described two different ways depending on which screen you read.
  const { content, fresh } = await loadSiteContent(stub(payloads));
  assert.equal(fresh, true);
  const [p] = content.products;
  assert.equal(p.id, "kho-gon");
  assert.equal(p.audience, "Doanh nghiệp");
  assert.equal(p.status, "Đã ra mắt");
  assert.deepEqual(p.skills, ["Web", "Android"]);
  assert.equal(p.category, "Vận hành");
  assert.match(p.image, /^https?:\/\/.*\/api\/files\/cover\.png$/);
  assert.equal(content.members[0].name, "An Nguyễn");
});

test("an empty catalogue stays empty instead of showing sample cards", async () => {
  // The mock fills a blank catalogue with examples. Real content must not:
  // "nothing published yet" is the truth, invented products are not.
  const { content } = await loadSiteContent(
    stub({ ...payloads, "/public/products": { items: [], total: 0 } }),
  );
  assert.equal(content.products.length, 0);
  assert.equal(content.showProductExamples, false);
});

test("a dead API serves the last good content, not the design mock", async () => {
  const good = await loadSiteContent(stub(payloads));
  assert.equal(good.fresh, true);

  const after = await loadSiteContent(stub({}, true));
  assert.equal(after.fresh, false);
  assert.equal(after.content.products[0].name, "Kho Gọn");
  assert.equal(after.content.showProductExamples, false);
});
