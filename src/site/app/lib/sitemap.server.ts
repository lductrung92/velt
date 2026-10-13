import { cached, ttlSeconds, localeConfig } from "./cache.server";
import { loadSiteContent } from "./site.server";
import { loadBlog } from "./blog.server";
import { blogPath } from "./blog";
import { allLocales, withLocale } from "./locales";
import { productPath } from "./catalog";

const API_BASE =
  process.env.SITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8081/api";

/**
 * The sitemap and robots.txt.
 *
 * A multilingual site has to say which pages exist and which languages each one
 * exists in, or a crawler finds the languages it happens to stumble on. Every
 * entry therefore carries an <xhtml:link> per language — including itself,
 * because an alternate set that does not reference back is ignored.
 *
 * Only pages worth indexing are listed: the home, the catalogue, the blog, and
 * every product and article. Filtered and paginated views are deliberately
 * absent; they are the same content sliced, and listing them invites a crawler
 * to spend its budget on slices.
 */

interface Entry {
  /** The address, already in the language it belongs to. */
  path: string;
  lastModified?: string;
  /**
   * True when the SAME path exists in every language — the static routes. Only
   * those get an <xhtml:link> set here, because only for those is the mapping
   * exact: a record's slug is translated with it, so pairing the languages of
   * an article means knowing its other slugs, which the page itself already
   * declares in its own <head>.
   */
  everyLanguage?: boolean;
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function collect(
  request: typeof fetch,
  locale: string,
): Promise<Entry[]> {
  const entries: Entry[] = [
    { path: "/", everyLanguage: true },
    { path: "/products", everyLanguage: true },
    { path: "/blog", everyLanguage: true },
  ];
  // Each language is listed from its OWN reads, so every address here is one
  // that language actually serves — a record with a translated slug is listed
  // under that slug, not under a guess built from the Vietnamese one.
  //
  // A failure on either read costs that part of the sitemap, not the file: a
  // sitemap listing three pages is still a usable sitemap.
  try {
    const { content } = await loadSiteContent(request, locale);
    for (const product of content.products) {
      entries.push({ path: productPath(product) });
    }
  } catch {
    // keep the static entries
  }
  try {
    const blog = await loadBlog("/blog?page=1", request, undefined, locale);
    for (const post of blog.items) {
      entries.push({
        path: blogPath(post.slug),
        lastModified: post.published_at ?? undefined,
      });
    }
  } catch {
    // keep what we have
  }
  return entries;
}

function renderURL(
  entry: Entry,
  locale: string,
  locales: string[],
  origin: string,
): string {
  const alternates = entry.everyLanguage
    ? locales
        .map(
          (other) =>
            `<xhtml:link rel="alternate" hreflang="${xml(other)}" href="${xml(
              origin + withLocale(entry.path, other),
            )}"/>`,
        )
        .join("") +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(
        origin + entry.path,
      )}"/>`
    : "";
  const lastmod = entry.lastModified
    ? `<lastmod>${xml(entry.lastModified)}</lastmod>`
    : "";
  return `<url><loc>${xml(
    origin + withLocale(entry.path, locale),
  )}</loc>${lastmod}${alternates}</url>`;
}

export async function sitemap(
  origin: string,
  request: typeof fetch = fetch,
): Promise<string> {
  const ttl = (await ttlSeconds(request)) * 1000;
  const { extras } = await localeConfig(request);
  const locales = allLocales(extras);
  return cached(`sitemap:${origin}:${locales.join(",")}`, ttl, async () => {
    const perLocale = await Promise.all(
      locales.map(async (locale) =>
        (await collect(request, locale))
          .map((entry) => renderURL(entry, locale, locales, origin))
          .join(""),
      ),
    );
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${perLocale.join("")}</urlset>`;
  });
}

/**
 * robots.txt.
 *
 * Everything is crawlable; the pages that should not be indexed say so with a
 * meta robots tag of their own, which is the signal that survives a page being
 * linked from elsewhere. The one line that matters here is where the sitemap is.
 */
export async function robots(
  origin: string,
  request: typeof fetch = fetch,
): Promise<string> {
  // A site that is not launched closes entirely — here AND in every page's
  // robots meta, because a crawler that never reads this file still reads the
  // page it landed on.
  if (await noindexAll(request)) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Whether the console has asked search engines to stay away entirely. */
async function noindexAll(request: typeof fetch): Promise<boolean> {
  try {
    const res = await request(`${API_BASE}/public/settings`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as Record<string, unknown>;
    return settings["seo.noindex_all"] === true;
  } catch {
    // Unreachable settings must not close a site that is open.
    return false;
  }
}
