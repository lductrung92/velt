import { content as fallbackContent } from "../data/content";
import { cached, ttlSeconds } from "./cache.server";
import { BASE_LOCALE } from "./locales";
import { translator, type MessageKey, type T } from "./i18n";
import type { Member, Product, SiteContent } from "../types";

/**
 * Loads the site's content from the console's public API.
 *
 * The site renders the same `SiteContent` shape it always has — this module
 * only changes where that shape comes from. Nothing about the layout or the
 * components moves, so the published pages look exactly as they did while the
 * content was a literal in `data/content.ts`.
 *
 * The API speaks its own vocabulary (slug/cover_url/lifecycle/is_featured) and
 * the site speaks another (id/image/status/featured). Translating between them
 * is this file's whole job; doing it here keeps every component untouched.
 */

const API_BASE =
  process.env.SITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8081/api";

/** Public product list item, as the catalog module publishes it. */
interface ApiProduct {
  slug: string;
  name: string;
  summary: string | null;
  cover_url: string | null;
  cover_width?: number;
  cover_height?: number;
  lifecycle: string;
  is_featured: boolean;
  audience: string[] | null;
  platforms: string[] | null;
  categories: { slug: string; name: string }[] | null;
}

interface ApiMember {
  slug: string;
  /** The public name. The API resolves the fallback to the real name, and
   *  never sends full_name on this endpoint — see backend migration 0051. */
  display_name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_width?: number;
  avatar_height?: number;
  email: string | null;
  zalo: string | null;
  links: { label: string; url: string }[] | null;
  skills: string[] | null;
}

interface ApiList<T> {
  items: T[];
  total: number;
}

/*
 * The API speaks codes — launched, individual, ios. The site shows a word for
 * each, and which word depends on the language being served, so the lookup goes
 * through the site's own message tables (catalog.*). A code the tables do not
 * know is shown as-is rather than as a blank: an unknown platform is better
 * read than invisible.
 */
/** The four accent colours the team grid cycles through. */
const MEMBER_COLORS = ["blue", "purple", "orange", "green"];

const coded = (t: T, group: string, code: string | undefined) => {
  if (!code) return "";
  return t(`catalog.${group}.${code}` as MessageKey) || code;
};

function absolute(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  // Uploaded media lives behind the API, not the site's own origin.
  try {
    return new URL(url, API_BASE.replace(/\/api\/?$/, "/")).href;
  } catch {
    return url;
  }
}

function toProduct(p: ApiProduct, t: T): Product {
  return {
    id: p.slug,
    name: p.name,
    summary: p.summary ?? "",
    // The list endpoint carries no body; the detail page fetches its own.
    category: p.categories?.[0]?.name ?? "",
    audience: coded(t, "audience", p.audience?.[0]),
    // The LIFECYCLE CODE, not a word for it: the card compares this value to
    // pick its colour, and a comparison against a translated word is a bug
    // waiting for the second language.
    status: p.lifecycle,
    featured: p.is_featured,
    image: absolute(p.cover_url),
    imageWidth: p.cover_width,
    imageHeight: p.cover_height,
    skills: (p.platforms ?? []).map((c) => coded(t, "platform", c)),
  };
}

function toMember(m: ApiMember, index: number): Member {
  return {
    id: m.slug,
    name: m.display_name,
    role: m.role ?? "",
    bio: m.bio ?? "",
    skills: m.skills ?? [],
    image: absolute(m.avatar_url),
    imageWidth: m.avatar_width,
    imageHeight: m.avatar_height,
    links: m.links ?? [],
    email: m.email ?? "",
    zalo: m.zalo ?? "",
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
  };
}

async function getJSON<T>(path: string, request: typeof fetch): Promise<T> {
  const res = await request(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The last content that loaded cleanly.
 *
 * When the API is unreachable the site keeps serving this rather than falling
 * back to the design mock: a stale real page is closer to the truth than a
 * fabricated one, and a visitor cannot tell that anything is wrong. The mock is
 * only used before the first successful load — i.e. on a cold start with the
 * API already down.
 */
let lastGood: SiteContent | null = null;

export interface LoadResult {
  content: SiteContent;
  /** False when this came from `lastGood` or the mock. */
  fresh: boolean;
}

export async function loadSiteContent(
  request: typeof fetch = fetch,
  locale: string = BASE_LOCALE,
): Promise<LoadResult> {
  const ttl = (await ttlSeconds(request)) * 1000;
  // One entry per language: the same key for both would serve whichever
  // language asked first to everyone until the TTL ran out.
  return cached(`site-content:${locale}`, ttl, () =>
    fetchSiteContent(request, locale),
  );
}

async function fetchSiteContent(
  request: typeof fetch,
  locale: string,
): Promise<LoadResult> {
  const t = translator(locale);
  try {
    const [products, members, settings] = await Promise.all([
      getJSON<ApiList<ApiProduct>>(
        `/public/products?page=1&page_size=60&locale=${encodeURIComponent(locale)}`,
        request,
      ),
      getJSON<ApiList<ApiMember>>(
        `/public/members?page=1&page_size=60&locale=${encodeURIComponent(locale)}`,
        request,
      ),
      getJSON<Record<string, unknown>>("/public/settings", request),
    ]);
    const loaded: SiteContent = {
      ...fallbackContent,
      brand: String(settings["app.name"] || fallbackContent.brand),
      products: (products.items ?? []).map((p) => toProduct(p, t)),
      members: (members.items ?? []).map(toMember),
      // The mock fills an empty catalogue with sample cards. Real content never
      // wants that: an empty catalogue means "nothing published yet", and
      // saying so is more honest than showing products that do not exist.
      showProductExamples: false,
    };
    lastGood = loaded;
    return { content: loaded, fresh: true };
  } catch {
    return { content: lastGood ?? fallbackContent, fresh: false };
  }
}
