// The API builds the URLs of everything it stores — "/api/files/<key>" for an
// upload, "/img/<slug>.webp" and "/files/<slug>.<ext>" for one that has been
// minted — and all three are relative. A browser resolves a relative URL
// against the page it is on, which is the console's own origin, not the API's:
// every such image loads the SPA's index.html instead of the file and renders
// broken. That is true of local dev (console :5173, API :8081) and of any
// deployment where the two are separate hosts.
//
// So a URL the API gave us is resolved against the API's origin before it ever
// reaches an `src`. The site solves the same problem for the HTML it renders
// (publicArticleHtml); this is the single-value version of it.

/**
 * The origin the API answers on, or "" when it shares the console's own (a
 * relative VITE_API_BASE_URL, i.e. a reverse proxy in front of both).
 */
const API_ORIGIN = ((): string => {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return "";
  try {
    const origin = new URL(base, window.location.origin).origin;
    return origin === window.location.origin ? "" : origin;
  } catch {
    return "";
  }
})();

/**
 * Resolves a URL the API built so the browser asks the API for it.
 *
 * Only for values that came from the server. The console's own assets
 * ("/logo.png", "/img/image-placeholder.svg") are relative on purpose and must
 * not be passed through here. Anything already absolute, a data: or blob: URL,
 * and an empty value are all returned untouched.
 */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!API_ORIGIN) return url;
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  return API_ORIGIN + url;
}
