import {
  blogPath,
  emptyBlog,
  type BlogArticle,
  type BlogCard,
  type BlogState,
} from "./blog";
import { safeUrl } from "./links";
import { BASE_LOCALE } from "./locales";

type BlogFetch = typeof fetch;
export function publicArticleHtml(html: string, origin: string) {
  // CMS local media URLs belong to the API, not the site's origin.
  return html.replace(/<(?:img|a)\b[^>]*>/gi, (tag) =>
    tag.replace(
      /\b(src|href)=(["'])(\/api\/files\/[^"']*)\2/gi,
      (_match, attribute: string, quote: string, path: string) =>
        `${attribute}=${quote}${new URL(path, origin).href}${quote}`,
    ),
  );
}
interface PublicList {
  items: BlogCard[];
  total: number;
  page: number;
  page_size: number;
}

export async function loadBlog(
  path: string,
  request: BlogFetch = fetch,
  base = process.env.SITE_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8081/api",
  // Last rather than first only because the callers that pass a fetch and a
  // base already exist; the API falls back to Vietnamese for anything it has
  // no translation of, so a missing locale costs a visitor nothing.
  locale: string = BASE_LOCALE,
): Promise<BlogState> {
  const url = new URL(path, "http://site.local");
  const state = emptyBlog();
  const isList = /^\/blog\/?$/.test(url.pathname);
  state.pageSize = isList ? 9 : 3;
  state.query = isList
    ? (url.searchParams.get("q") || "").trim().slice(0, 200)
    : "";
  const rawSort = url.searchParams.get("sort");
  state.sort =
    isList && (rawSort === "oldest" || rawSort === "title")
      ? rawSort
      : "newest";
  state.page = isList
    ? Math.min(
        100000,
        Math.max(
          1,
          Number.parseInt(url.searchParams.get("page") || "1", 10) || 1,
        ),
      )
    : 1;
  const api = base.replace(/\/$/, "");
  const publicOrigin = new URL(process.env.SITE_PUBLIC_API_BASE_URL || api)
    .origin;
  const media = (value: string | null) =>
    value ? safeUrl(new URL(value, publicOrigin).href) || null : null;
  const readList = async () => {
    const params = new URLSearchParams({
      locale,
      q: state.query,
      sort: state.sort,
      page: String(state.page),
      page_size: String(state.pageSize),
    });
    const response = await request(`${api}/public/cms/articles?${params}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`Blog list ${response.status}`);
    const data = (await response.json()) as PublicList;
    if (!Array.isArray(data.items) || !Number.isFinite(data.total))
      throw new Error("Invalid blog response");
    state.items = data.items.map((card) => ({
      ...card,
      cover_url: media(card.cover_url),
    }));
    state.total = data.total;
  };
  try {
    if (url.pathname.startsWith("/blog/") && !isList) {
      let slug: string;
      try {
        slug = decodeURIComponent(url.pathname.slice(6));
      } catch {
        return { ...state, status: "not-found" };
      }
      if (!slug || slug.includes("/")) return { ...state, status: "not-found" };
      const response = await request(
        `${api}/public/cms/articles/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (response.status === 404) return { ...state, status: "not-found" };
      if (!response.ok) throw new Error(`Blog article ${response.status}`);
      const article = (await response.json()) as BlogArticle;
      if (!article.slug || !article.title)
        throw new Error("Invalid article response");
      state.article = {
        ...article,
        cover_url: media(article.cover_url),
        body_html: publicArticleHtml(article.body_html || "", publicOrigin),
      };
      // Related content is optional: failure must not hide a successfully loaded post.
      try {
        await readList();
      } catch {
        state.items = [];
      }
      state.items = state.items.filter((card) => card.slug !== article.slug);
    } else {
      await readList();
      const last = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page > last) {
        state.page = last;
        await readList();
      }
    }
    return state;
  } catch {
    return { ...state, status: "unavailable", items: [] };
  }
}

export function articleRedirect(path: string, state: BlogState) {
  if (!state.article) return undefined;
  const url = new URL(path, "http://site.local");
  if (url.pathname === blogPath(state.article.slug)) return undefined;
  return blogPath(state.article.slug) + url.search;
}
