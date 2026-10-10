import type { Page, Route } from "@playwright/test";

// Deterministic, in-memory API mock for the console E2E suite. Installs route
// handlers for the auth bootstrap (refresh + me + public settings) and the file
// manager endpoints, with a stateful pseudo-filesystem so create/delete are
// reflected in subsequent listings — no real backend, DB or object store.

export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: string;
}

const MTIME = "2026-01-01T00:00:00Z";
const base = (p: string) => p.split("/").pop() ?? p;
export const dir = (p: string): Entry => ({ name: base(p), path: p, is_dir: true, size: 0, mtime: MTIME });
export const file = (p: string, size = 12): Entry => ({ name: base(p), path: p, is_dir: false, size, mtime: MTIME });

// Default tree: root zones + a populated media folder.
export function defaultFs(): Record<string, Entry[]> {
  return {
    "": [dir("media"), dir("shared")],
    media: [dir("media/img"), file("media/a.txt")],
    "media/img": [file("media/img/logo.png")],
    shared: [],
  };
}

// Every zone is writable for super_admin EXCEPT customers/ + customer-files/
// (customer data — read-only). Mirrors backend filemanager/zones.go.
const WRITABLE_ZONES = ["media", "shared", "public", "cms", "games", "users"];
const isWritable = (p: string) => p !== "" && WRITABLE_ZONES.includes(p.split("/")[0]);

const USER = {
  id: "sa-1",
  email: "root@velt.local",
  full_name: "Root",
  avatar_url: null,
  status: "active",
  created_at: MTIME,
  last_login_at: null,
};

export interface MockOptions {
  /** Effective permission set returned by /auth/me. Default ["*"] (super_admin). */
  permissions?: string[];
  roles?: string[];
  fs?: Record<string, Entry[]>;
  /** Force an error status on the GET listing (e.g. 403) to test the error state. */
  listStatus?: number;
}

export async function mockApi(page: Page, opts: MockOptions = {}): Promise<void> {
  const permissions = opts.permissions ?? ["*"];
  const roles = opts.roles ?? ["super_admin"];
  const fs = opts.fs ?? defaultFs();

  // Force English so specs assert stable English labels (default locale is vi).
  await page.addInitScript(() => {
    window.localStorage.setItem("velt.local.vne", "en");
  });

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  // --- auth bootstrap ---
  await page.route("**/api/auth/refresh", (r) =>
    json(r, 200, { access_token: "e2e-token", token_type: "Bearer", expires_in: 900, user: USER }),
  );
  await page.route("**/api/auth/me", (r) => json(r, 200, { user: USER, roles, permissions }));
  await page.route("**/api/public/settings", (r) => json(r, 200, {}));

  // --- file manager (specific paths first; the bare-list regex excludes them) ---
  await page.route("**/api/admin/files/folder", (r) => {
    const { path, name } = JSON.parse(r.request().postData() ?? "{}");
    const full = path ? `${path}/${name}` : name;
    (fs[path] ??= []).push(dir(full));
    fs[full] = [];
    return json(r, 201, dir(full));
  });
  await page.route("**/api/admin/files/rename", (r) => json(r, 200, { ok: true }));

  // GET (list) + DELETE on the bare /api/admin/files endpoint.
  await page.route(/\/api\/admin\/files(\?|$)/, (r) => {
    const url = new URL(r.request().url());
    const path = url.searchParams.get("path") ?? "";
    if (r.request().method() === "DELETE") {
      const parent = path.split("/").slice(0, -1).join("/");
      fs[parent] = (fs[parent] ?? []).filter((e) => e.path !== path);
      delete fs[path];
      return r.fulfill({ status: 204, body: "" });
    }
    if (opts.listStatus && opts.listStatus >= 400) {
      return json(r, opts.listStatus, { error: { message: "access_denied", details: {} } });
    }
    return json(r, 200, { path, writable: isWritable(path), entries: fs[path] ?? [] });
  });
}
