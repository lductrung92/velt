import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production");
const port = Number(process.env.PORT || 5373),
  host = process.env.HOST || "127.0.0.1";
let vite, render, manifest;
if (production) {
  ({ renderRequest: render } = await import("./dist/server/entry-server.js"));
  manifest = JSON.parse(
    await readFile(path.join(root, "dist/client/.vite/manifest.json"), "utf8"),
  );
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server: undefined } },
    appType: "custom",
  });
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// A weak ETag over the rendered HTML: cheap, and it changes exactly when the
// page does. Crawlers revalidate constantly, and answering them with 304 costs
// us nothing.
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + text.length.toString(36);
};
const control = (ttl) =>
  ttl > 0
    ? `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 5}`
    : "no-store";
// The console owns the TTL (site.cache_ttl_seconds). Read it rarely: it is a
// knob, not a hot path.
let ttlMemo = { value: 60, expires: 0 };
let seenVersion = null;
// The same derived token the content cache watches. Checking it here is what
// lets a publish clear the rendered HTML too, not just the data behind it.
async function checkVersion(base) {
  try {
    const res = await fetch(`${base}/public/cms/version`);
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version) return;
    if (seenVersion !== null && seenVersion !== version) pageCache.clear();
    seenVersion = version;
  } catch {
    // Keep what we have: a hiccup must not cost us a warm cache.
  }
}
async function cacheTtl() {
  if (Date.now() < ttlMemo.expires) return ttlMemo.value;
  try {
    const base =
      process.env.SITE_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:8081/api";
    const [settings] = await Promise.all([
      fetch(`${base}/public/settings`),
      checkVersion(base),
    ]);
    if (settings.ok) {
      const raw = Number((await settings.json())["site.cache_ttl_seconds"]);
      if (Number.isFinite(raw) && raw >= 0) ttlMemo.value = raw;
    }
  } catch {
    // Keep the last known value: an unreachable API must not disable caching.
  }
  ttlMemo.expires = Date.now() + 10_000;
  return ttlMemo.value;
}

// Rendered pages, keyed by the URL that produced them. A published page is the
// same bytes for every visitor, so rendering it once per TTL is enough — this
// is what takes a page view from "render + fetch" down to a map lookup.
// Entries are small (tens of KB) and the key space is the site's own routes,
// so an unbounded map would still be fine; the cap is there to make a crawler
// hitting ?a=1&a=2&… unable to grow it without limit.
const pageCache = new Map();
const PAGE_CACHE_MAX = 200;
function pageGet(key) {
  const hit = pageCache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    pageCache.delete(key);
    return undefined;
  }
  return hit;
}
function pageSet(key, value, ttl) {
  if (ttl <= 0) return;
  if (pageCache.size >= PAGE_CACHE_MAX) {
    // Oldest insertion first — Map preserves insertion order.
    pageCache.delete(pageCache.keys().next().value);
  }
  pageCache.set(key, { ...value, expires: Date.now() + ttl * 1000 });
}

const mime = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
};
async function serve(req, res) {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (production && url.pathname.startsWith("/assets/")) {
      let name;
      try {
        name = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const directory = path.resolve(root, "dist/client");
      const file = path.resolve(directory, "." + name);
      if (!file.startsWith(directory + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        if (!(await stat(file)).isFile()) throw new Error("Not a file");
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        });
        if (req.method === "HEAD") res.end();
        else createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    // robots.txt and the sitemap are served from the same place as the pages,
    // so the sitemap always speaks of the origin the request came in on — a
    // sitemap listing another host is ignored.
    if (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml") {
      const module = production
        ? await import("./dist/server/entry-server.js")
        : await vite.ssrLoadModule("/app/lib/sitemap.server.ts");
      const site = production ? module : module;
      const body =
        url.pathname === "/robots.txt"
          ? await site.robots(url.origin)
          : await site.sitemap(url.origin);
      res.writeHead(200, {
        "Content-Type":
          url.pathname === "/robots.txt"
            ? "text/plain; charset=utf-8"
            : "application/xml; charset=utf-8",
        "Cache-Control": control(await cacheTtl()),
      });
      res.end(req.method === "HEAD" ? "" : body);
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const ttlNow = await cacheTtl();
    const cacheKey = url.pathname + url.search;
    const hit = ttlNow > 0 ? pageGet(cacheKey) : undefined;
    if (hit) {
      if (req.headers["if-none-match"] === hit.etag) {
        res
          .writeHead(304, { ETag: hit.etag, "Cache-Control": control(ttlNow) })
          .end();
        return;
      }
      res.writeHead(hit.status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": control(ttlNow),
        ETag: hit.etag,
        "X-ZUKATEK-Render": "react-ssr",
        "X-ZUKATEK-Cache": "hit",
      });
      res.end(req.method === "HEAD" ? "" : hit.html);
      return;
    }
    const currentRender = production
      ? render
      : (await vite.ssrLoadModule("/app/entry-server.tsx")).renderRequest;
    const result = await currentRender(url.pathname + url.search);
    if (result.redirect) {
      res.writeHead(301, { Location: result.redirect }).end();
      return;
    }
    const entry = manifest?.["app/entry-client.tsx"];
    const styles = production
      ? (entry.css || []).map((file) => `/${file}`)
      : ["styles", "catalog", "profile", "team", "chat", "blog"].map(
          (file) => `/app/styles/${file}.css`,
        );
    const serialized = JSON.stringify(result.props)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const metadata = [
      result.canonical
        ? `<link rel="canonical" href="${escape(new URL(result.canonical, url.origin).href)}">`
        : "",
      `<meta name="robots" content="${result.noindex ? "noindex" : "index"},${result.nofollow ? "nofollow" : "follow"}">`,
      result.image
        ? `<meta property="og:image" content="${escape(result.image)}">`
        : "",
      // One <link> per language, this page included, plus the fallback for a
      // reader whose language is not among them. Search engines ignore a set
      // that does not reference itself, so this is emitted whole or not at all.
      ...(result.alternates || []).flatMap((alternate) => {
        const href = escape(new URL(alternate.href, url.origin).href);
        const tags = [
          `<link rel="alternate" hreflang="${escape(alternate.locale)}" href="${href}">`,
        ];
        if (alternate.xDefault)
          tags.push(`<link rel="alternate" hreflang="x-default" href="${href}">`);
        return tags;
      }),
    ].join("");
    const head = result.head || {};
    // One <script> from one of two vendors, chosen by the shape of the id the
    // console was given: "G-…" is GA4, anything with a dot is a Plausible
    // domain. Nothing configured means no third-party script at all, which is
    // the default a visitor deserves.
    const analytics = !head.analyticsId
      ? ""
      : head.analyticsId.startsWith("G-")
        ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escape(head.analyticsId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${escape(head.analyticsId)}')</script>`
        : `<script defer data-domain="${escape(head.analyticsId)}" src="https://plausible.io/js/script.js"></script>`;
    const siteHead = [
      head.verification
        ? `<meta name="google-site-verification" content="${escape(head.verification)}">`
        : "",
      head.primaryColor
        ? `<style>:root{--primary:${escape(head.primaryColor)}}</style>`
        : "",
      analytics,
    ].join("");
    let html = `<!doctype html><html lang="${escape(result.lang || "vi")}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0061fd"><title>${escape(result.title)}</title><meta name="description" content="${escape(result.description)}"><meta property="og:title" content="${escape(result.ogTitle || result.title)}"><meta property="og:description" content="${escape(result.ogDescription || result.description)}"><meta property="og:type" content="${escape(result.ogType || "website")}">${metadata}<link rel="icon" href="${escape(head.faviconUrl || "/assets/favicon.png")}">${siteHead}<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/be-vietnam-pro-6.woff2"><link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/be-vietnam-pro-7.woff2"><link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/fonts/be-vietnam-pro-8.woff2"><link rel="stylesheet" href="/assets/fonts/fonts.css">${styles.map((file) => `<link rel="stylesheet" href="${file}">`).join("")}</head><body><div id="root">${result.html}</div><script id="site-data" type="application/json">${serialized}</script><script type="module" src="${production ? "/" + entry.file : "/app/entry-client.tsx"}"></script><noscript><p class="noscript-note">${escape(result.noscript || "")}</p></noscript></body></html>`;
    if (vite) html = await vite.transformIndexHtml(url.pathname, html);
    // A published page is the same bytes for everyone, so it is worth caching
    // in front of us. `stale-while-revalidate` lets a CDN keep answering from
    // its copy while it refreshes behind the scenes, so a cache expiry never
    // costs a visitor the wait. ttl 0 (set in the console) means "do not cache"
    // — what you want while editing.
    const ttl = result.status === 200 ? ttlNow : 0;
    const etag = ttl > 0 ? `W/"${hash(html)}"` : undefined;
    if (etag) pageSet(cacheKey, { html, etag, status: result.status }, ttl);
    if (etag && req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, "Cache-Control": control(ttl) }).end();
      return;
    }
    res.writeHead(result.status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": control(ttl),
      ...(etag ? { ETag: etag } : {}),
      "X-ZUKATEK-Render": "react-ssr",
      "X-ZUKATEK-Cache": ttl > 0 ? "miss" : "bypass",
    });
    res.end(req.method === "HEAD" ? "" : html);
  } catch (error) {
    vite?.ssrFixStacktrace(error);
    console.error(error);
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Không thể tải trang. Vui lòng thử lại.");
  }
}
const server = http.createServer((req, res) => {
  if (vite)
    vite.middlewares(req, res, () => {
      void serve(req, res);
    });
  else void serve(req, res);
});
server.listen(port, host, () =>
  console.log(
    `ZUKATEK React SSR: http://${host}:${port} (${production ? "production" : "development"})`,
  ),
);
const shutdown = () => {
  server.close();
  void vite?.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
