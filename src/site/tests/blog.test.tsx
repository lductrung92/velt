import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../app/entry-server";
import { articleOutline, emptyBlog, type BlogArticle } from "../app/lib/blog";
import {
  loadBlog,
  articleRedirect,
  publicArticleHtml,
} from "../app/lib/blog.server";

const post: BlogArticle = {
  slug: "bai-viet-thu",
  title: "Chia sẻ từ đội ngũ",
  excerpt: "Mô tả bài viết",
  cover_url: null,
  published_at: "2026-10-13T06:00:00Z",
  locale: "vi",
  body_html:
    "<h2>Ý tưởng</h2><p>Nội dung bài viết.</p><h3>Kế hoạch</h3><p>Bước tiếp theo.</p>",
  seo: { title: "Tiêu đề SEO", description: "Mô tả SEO", noindex: true },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("CMS inline media loads from API origin while site links and external images stay unchanged", () => {
  const html =
    '<p><img src="/api/files/cms/articles/a/inline.jpg" alt="Ảnh"><a href="/products">Sản phẩm</a><img src="https://images.example/image.jpg"></p>';
  const normalized = publicArticleHtml(html, "http://api.local");
  assert.match(
    normalized,
    /src="http:\/\/api.local\/api\/files\/cms\/articles\/a\/inline.jpg"/,
  );
  assert.match(normalized, /href="\/products"/);
  assert.match(normalized, /src="https:\/\/images.example\/image.jpg"/);
  assert.equal(
    publicArticleHtml(
      '&lt;img src="/api/files/example.jpg"&gt;',
      "http://api.local",
    ),
    '&lt;img src="/api/files/example.jpg"&gt;',
  );
});

test("blog list renders published cards and preserves referral/search pagination in SSR", () => {
  const state = {
    ...emptyBlog(),
    items: [post],
    total: 25,
    query: "đội ngũ",
    page: 2,
  };
  const result = render(
    "/blog?q=%C4%91%E1%BB%99i+ng%C5%A9&page=2&ref=member-2",
    state,
  );
  assert.equal(result.status, 200);
  assert.match(result.html, /Chia sẻ từ đội ngũ/);
  assert.match(result.html, /\/blog\/bai-viet-thu\?ref=member-2/);
  assert.match(result.html, /name="ref" value="member-2"/);
  assert.match(result.html, /aria-current="page" aria-label="Trang 2"/);
  assert.equal(result.noindex, true);
});

test("article SSR renders readable CMS HTML, stable heading links and article SEO", () => {
  const result = render("/blog/bai-viet-thu", {
    ...emptyBlog(),
    article: post,
  });
  assert.equal(result.status, 200);
  assert.equal(result.title, "Tiêu đề SEO");
  assert.equal(result.description, "Mô tả SEO");
  assert.equal(result.ogType, "article");
  assert.equal(result.noindex, true);
  assert.match(result.html, /<h2 id="blog-heading-1">Ý tưởng<\/h2>/);
  assert.match(result.html, /href="#blog-heading-2"/);
  assert.match(result.html, /Nội dung bài viết/);
  assert.equal(articleOutline("<p></p>").minutes, 1);
});

test("the article cover offers only served widths it has pixels for, and an image without dimensions keeps its plain tag", () => {
  const sized = render("/blog/bai-viet-thu", {
    ...emptyBlog(),
    article: {
      ...post,
      cover_url: "http://api.local/img/anh-bia-8a304388.png",
      cover_width: 960,
      cover_height: 540,
    },
  });
  // 1280 and 1920 are absent: the server does not upscale, so advertising them
  // would buy the same pixels twice.
  assert.match(
    sized.html,
    /type="image\/webp" srcSet="http:\/\/api.local\/img\/anh-bia-8a304388\/320.webp 320w, http:\/\/api.local\/img\/anh-bia-8a304388\/640.webp 640w, http:\/\/api.local\/img\/anh-bia-8a304388\/960.webp 960w"/,
  );
  assert.match(sized.html, /width="960" height="540"/);
  assert.match(sized.html, /fetchPriority="high"/);
  assert.doesNotMatch(sized.html, /1280.webp/);

  // No files row: no dimensions, no slug to size by — and still an image.
  const plain = render("/blog/bai-viet-thu", {
    ...emptyBlog(),
    article: { ...post, cover_url: "http://api.local/api/files/a/cover.png" },
  });
  assert.match(
    plain.html,
    /<img src="http:\/\/api.local\/api\/files\/a\/cover.png"/,
  );
  assert.doesNotMatch(plain.html, /srcSet/);
});

test("unpublished/missing article is404; API failure is503 rather than a fabricated post", () => {
  const missing = render("/blog/not-published", {
    ...emptyBlog(),
    status: "not-found",
  });
  assert.equal(missing.status, 404);
  assert.match(missing.html, /Bài viết không còn khả dụng/);
  const down = render("/blog", { ...emptyBlog(), status: "unavailable" });
  assert.equal(down.status, 503);
  assert.match(down.html, /Chưa thể tải bài viết/);
  const empty = render("/blog", emptyBlog());
  assert.equal(empty.status, 200);
  assert.match(empty.html, /Những câu chuyện đang được viết/);
});

test("public loader uses only no-auth published API, clamps page and resolves cover URLs", async () => {
  const calls: string[] = [];
  const mock = (async (input) => {
    calls.push(String(input));
    const page = new URL(String(input)).searchParams.get("page");
    return json({
      items:
        page === "999" ? [] : [{ ...post, cover_url: "/storage/cover.jpg" }],
      total: 1,
      page: Number(page),
      page_size: 9,
    });
  }) as typeof fetch;
  const state = await loadBlog(
    "/blog?page=999&q=team&sort=title",
    mock,
    "http://api.local/api",
  );
  assert.equal(state.page, 1);
  assert.equal(state.items[0].cover_url, "http://api.local/storage/cover.jpg");
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      (call) =>
        call.includes("/api/public/cms/articles?") &&
        call.includes("locale=vi") &&
        call.includes("q=team") &&
        call.includes("sort=title"),
    ),
  );
});

test("renamed article redirects to canonical site slug while keeping referral; related outage is optional", async () => {
  const mock = (async (input) =>
    String(input).includes("/old-slug?")
      ? json(post)
      : json({}, 503)) as typeof fetch;
  const state = await loadBlog(
    "/blog/old-slug?ref=member-4",
    mock,
    "http://api.local/api",
  );
  assert.equal(state.status, "ready");
  assert.equal(state.article?.title, post.title);
  assert.deepEqual(state.items, []);
  assert.equal(
    articleRedirect("/blog/old-slug?ref=member-4", state),
    "/blog/bai-viet-thu?ref=member-4",
  );
});

test("public loader distinguishes404 and outage without reading authenticated CMS endpoints", async () => {
  const missing = await loadBlog(
    "/blog/private-draft",
    (async () => json({}, 404)) as typeof fetch,
    "http://api.local/api",
  );
  assert.equal(missing.status, "not-found");
  const down = await loadBlog(
    "/blog",
    (async () => {
      throw new Error("offline");
    }) as typeof fetch,
    "http://api.local/api",
  );
  assert.equal(down.status, "unavailable");
});
