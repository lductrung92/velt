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
  ({ render } = await import("./dist/server/entry-server.js"));
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
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const currentRender = production
      ? render
      : (await vite.ssrLoadModule("/app/entry-server.tsx")).render;
    const result = currentRender(url.pathname + url.search);
    const entry = manifest?.["app/entry-client.tsx"];
    const styles = production
      ? (entry.css || []).map((file) => `/${file}`)
      : ["styles", "catalog", "profile", "team", "chat"].map(
          (file) => `/app/styles/${file}.css`,
        );
    const serialized = JSON.stringify(result.props)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    let html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0061fd"><title>${escape(result.title)}</title><meta name="description" content="${escape(result.description)}"><meta property="og:title" content="${escape(result.title)}"><meta property="og:description" content="${escape(result.description)}"><meta property="og:type" content="website"><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/assets/fonts/fonts.css">${styles.map((file) => `<link rel="stylesheet" href="${file}">`).join("")}</head><body><div id="root">${result.html}</div><script id="site-data" type="application/json">${serialized}</script><script type="module" src="${production ? "/" + entry.file : "/app/entry-client.tsx"}"></script><noscript><p class="noscript-note">Vui lòng bật JavaScript để sử dụng bộ lọc, hồ sơ thành viên, biểu mẫu và chatbox.</p></noscript></body></html>`;
    if (vite) html = await vite.transformIndexHtml(url.pathname, html);
    res.writeHead(result.status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-ZUKATEK-Render": "react-ssr",
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
