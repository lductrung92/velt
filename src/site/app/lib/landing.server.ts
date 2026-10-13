import type { PublicSection } from "../types";
import { cached, ttlSeconds } from "./cache.server";

/**
 * Loads the sections the console published for the home page.
 *
 * Which page is the home page is the console's decision, not ours: it is the
 * `cms.home_page_slug` setting. Empty — the default — means "no landing is in
 * charge", and the site falls back to its built-in layout. That fallback is
 * not a degraded mode: it is what the page looks like today, and it stays the
 * answer until somebody deliberately publishes a landing.
 *
 * Every failure path here returns an empty list for the same reason: a
 * mis-typed slug, an unpublished page or an API that is down must leave the
 * home page standing, not blank it.
 */

const API_BASE =
  process.env.SITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8081/api";

interface PublicPage {
  sections?: PublicSection[] | null;
}

async function fetchHomeSections(
  request: typeof fetch,
): Promise<PublicSection[]> {
  try {
    const settingsRes = await request(`${API_BASE}/public/settings`, {
      headers: { Accept: "application/json" },
    });
    if (!settingsRes.ok) return [];
    const settings = (await settingsRes.json()) as Record<string, unknown>;
    const slug = String(settings["cms.home_page_slug"] || "").trim();
    if (!slug) return [];

    const pageRes = await request(
      `${API_BASE}/public/cms/pages/${encodeURIComponent(slug)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!pageRes.ok) return [];
    const page = (await pageRes.json()) as PublicPage;
    return Array.isArray(page.sections) ? page.sections : [];
  } catch {
    return [];
  }
}

export async function loadHomeSections(
  request: typeof fetch = fetch,
): Promise<PublicSection[]> {
  const ttl = (await ttlSeconds(request)) * 1000;
  return cached("home-sections", ttl, () => fetchHomeSections(request));
}
