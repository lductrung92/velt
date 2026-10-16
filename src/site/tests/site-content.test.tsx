import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSiteContent } from "../app/lib/site.server";
import { lifecycleLabel } from "../app/lib/catalog";
import { translator } from "../app/lib/i18n";
import { purge } from "../app/lib/cache.server";

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
// The public roster sends display_name only — the API resolves the fallback and
// never ships full_name to an unauthenticated caller (backend migration 0051).
const member = {
  slug: "an-nguyen",
  display_name: "An Nguyễn",
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
  // TTL 0 turns caching off, so each test sees the stub it set up rather
  // than a value another test warmed. Caching has its own test below.
  "/public/settings": { "app.name": "Zukatek", "site.cache_ttl_seconds": 0 },
};

test("API codes become the words the console shows", async () => {
  // The console calls these "Doanh nghiệp" and "Đã ra mắt". One product must
  // not be described two different ways depending on which screen you read.
  const { content, fresh } = await loadSiteContent(stub(payloads));
  assert.equal(fresh, true);
  const [p] = content.products;
  assert.equal(p.id, "kho-gon");
  assert.equal(p.audience, "Doanh nghiệp");
  // The lifecycle stays a CODE on the product: the card compares it to choose
  // a colour, and the word is picked where it is shown, in the right language.
  assert.equal(p.status, "launched");
  assert.equal(lifecycleLabel(translator("vi"), p.status), "Đã ra mắt");
  assert.equal(lifecycleLabel(translator("en"), p.status), "Launched");
  assert.deepEqual(p.skills, ["Web", "Android"]);
  assert.equal(p.category, "Vận hành");
  assert.match(p.image ?? "", /^https?:\/\/.*\/api\/files\/cover\.png$/);
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

test("a cached page is served without touching the API again", async () => {
  purge();
  let calls = 0;
  const counting = ((...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    if (!url.includes("/public/settings")) calls += 1;
    return stub({ ...payloads, "/public/settings": { "app.name": "Zukatek", "site.cache_ttl_seconds": 60 } })(...args);
  }) as unknown as typeof fetch;

  await loadSiteContent(counting);
  const first = calls;
  await loadSiteContent(counting);
  await loadSiteContent(counting);

  // Two further page views must cost nothing: the whole point of the cache.
  assert.equal(calls, first);
  purge();
});
