export interface BlogCard {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  /** The cover's INTRINSIC size; absent for an image with no `files` row. */
  cover_width?: number;
  cover_height?: number;
  published_at: string | null;
}

export interface BlogArticle extends BlogCard {
  locale: string;
  /** Every language this article is published in, with its own slug. */
  alternates?: { locale: string; slug: string; x_default?: boolean }[];
  body_html: string | null;
  seo: {
    title?: string | null;
    description?: string | null;
    canonical_url?: string | null;
    noindex?: boolean;
    nofollow?: boolean;
    og_title?: string | null;
    og_description?: string | null;
  };
}

export interface BlogState {
  status: "ready" | "unavailable" | "not-found";
  items: BlogCard[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  sort: "newest" | "oldest" | "title";
  article?: BlogArticle;
}

export function emptyBlog(): BlogState {
  return {
    status: "ready",
    items: [],
    total: 0,
    page: 1,
    pageSize: 9,
    query: "",
    sort: "newest",
  };
}

export const blogPath = (slug: string) => `/blog/${encodeURIComponent(slug)}`;

/**
 * A publication date, written the way the language being read writes dates.
 *
 * Intl wants a BCP 47 tag; the site's codes are already valid ones except for
 * Vietnamese, where "vi-VN" produces the day-month order a Vietnamese reader
 * expects rather than the bare-language default.
 */
export function blogDate(value: string | null, locale = "vi") {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function plainArticle(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#34|#38|#39|#60|#62);/g,
      (entity) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          // The numeric forms are what the backend's sanitizer actually emits
          // (Go escapes a quote as &#34;, never &quot;), so a heading with
          // quotation marks reached the table of contents still escaped.
          "&#34;": '"',
          "&#38;": "&",
          "&#39;": "'",
          "&#60;": "<",
          "&#62;": ">",
        })[entity] || entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

// The public API supplies HTML sanitized by the backend's htmlsan.Body allowlist.
// Only add stable heading anchors here; never use admin/raw editor endpoints.
export function articleOutline(html: string) {
  const headings: { id: string; label: string; level: number }[] = [];
  const body = html.replace(
    /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (original, level: string, contents: string) => {
      const label = plainArticle(contents);
      if (!label) return original;
      const id = `blog-heading-${headings.length + 1}`;
      headings.push({ id, label, level: Number(level) });
      return `<h${level} id="${id}">${contents}</h${level}>`;
    },
  );
  return {
    body,
    headings,
    minutes: Math.max(
      1,
      Math.ceil(plainArticle(html).split(/\s+/).filter(Boolean).length / 200),
    ),
  };
}
