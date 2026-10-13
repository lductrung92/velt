/**
 * Caching for the SSR tier.
 *
 * The public site is read-only and its content only moves when somebody
 * publishes in the console, so re-rendering every page on every request buys
 * nothing. Three things live here:
 *
 *   • `cached()`   — a small TTL store with stale-while-revalidate
 *   • `ttlSeconds()` — the TTL the console configured (site.cache_ttl_seconds)
 *   • `contentVersion()` — a cheap signal that invalidates everything at once
 *
 * STALE-WHILE-REVALIDATE is the important part. When an entry expires the
 * stale value is returned IMMEDIATELY and the refresh runs behind it, so a
 * visitor never waits for the API and a slow API degrades latency for nobody.
 * A cold miss is the only request that blocks.
 */

const API_BASE =
  process.env.SITE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8081/api";

interface Entry<T> {
  value: T;
  /** When the value stops being fresh. */
  expires: number;
  /** Set while a background refresh is in flight, so only one runs. */
  refreshing?: Promise<void>;
}

const store = new Map<string, Entry<unknown>>();
let ttlCache: { value: number; expires: number } | null = null;

/**
 * Clears everything, including the remembered TTL. Called when the content
 * version moves — and the TTL goes with it, because "forget everything" that
 * kept one stale number would re-read the rest at the wrong cadence.
 */
export function purge(): void {
  store.clear();
  ttlCache = null;
}

export function size(): number {
  return store.size;
}

/**
 * Returns a cached value, refreshing it when stale.
 *
 * `load` is never awaited on a stale hit — that is the whole point. If it
 * rejects, the stale value stays and the next request tries again: a failing
 * API must not empty the cache, or one outage turns into a thundering herd.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  if (ttlMs <= 0) return load();
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && hit.expires > now) return hit.value;

  if (hit) {
    hit.refreshing ??= load()
      .then((value) => {
        store.set(key, { value, expires: Date.now() + ttlMs });
      })
      .catch(() => {
        // Keep serving the stale value, but let the next request retry rather
        // than sitting behind a promise that already failed.
        hit.expires = Date.now() + Math.min(ttlMs, 5_000);
      })
      .finally(() => {
        const current = store.get(key) as Entry<T> | undefined;
        if (current) current.refreshing = undefined;
      });
    return hit.value;
  }

  const value = await load();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/**
 * The TTL the console configured, itself cached briefly — the setting is read
 * on every request and must not cost a round trip each time, but turning
 * caching off while editing should take effect within seconds, not minutes.
 */
export async function ttlSeconds(request: typeof fetch = fetch): Promise<number> {
  const now = Date.now();
  if (ttlCache && ttlCache.expires > now) return ttlCache.value;
  let value = 60;
  try {
    const res = await request(`${API_BASE}/public/settings`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const settings = (await res.json()) as Record<string, unknown>;
      const raw = Number(settings["site.cache_ttl_seconds"]);
      if (Number.isFinite(raw) && raw >= 0) value = raw;
    }
  } catch {
    // Unreachable settings must not disable caching — that would turn an API
    // blip into full load on every page view.
    value = ttlCache?.value ?? 60;
  }
  ttlCache = { value, expires: now + 10_000 };
  return value;
}
