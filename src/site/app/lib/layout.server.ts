import { cached, ttlSeconds } from "./cache.server";
import { DEFAULT_LAYOUT, resolveLayout, type SiteLayout } from "./layout";

/**
 * Loads the header and the footer the console publishes.
 *
 * Two reads, in parallel: the navigation (one tree per slot) and the public
 * settings (the words around it). Either one failing is not an error worth
 * showing a visitor — the site falls back to the copy it ships with, which is
 * exactly what the page looked like before any of this was editable.
 *
 * Every route needs this, so it is cached like the rest of the SSR data and the
 * published-version poll drops it along with everything else.
 */

const API_BASE =
  process.env.SITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8081/api";

async function readJSON(request: typeof fetch, path: string): Promise<unknown> {
  const res = await request(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  return res.ok ? await res.json() : null;
}

async function fetchLayout(request: typeof fetch): Promise<SiteLayout> {
  try {
    const [menus, settings] = await Promise.all([
      readJSON(request, "/public/cms/menus"),
      readJSON(request, "/public/settings"),
    ]);
    return resolveLayout(menus, settings);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function loadLayout(
  request: typeof fetch = fetch,
): Promise<SiteLayout> {
  const ttl = (await ttlSeconds(request)) * 1000;
  return cached("site-layout", ttl, () => fetchLayout(request));
}
