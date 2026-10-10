import type { Page, Route } from "@playwright/test";

// In-memory API mock for the CMS landing E2E: auth bootstrap + stateful page and
// landing stores (create/list/detail/sections reflected in later reads), so the
// page-kind=landing → design flow runs with no real backend. One dispatch route
// per API family (/api/cms/pages*, /api/cms/landing*), routed by path + method.

const MTIME = "2026-01-01T00:00:00Z";

const USER = {
  id: "sa-1",
  email: "root@velt.local",
  full_name: "Root",
  avatar_url: null,
  status: "active",
  created_at: MTIME,
  last_login_at: null,
};

interface Section {
  id: string;
  type: string;
  sort_order: number;
  is_visible: boolean;
  config: Record<string, unknown>;
}
interface Landing {
  id: string;
  key: string;
  name: string;
  status: "draft" | "published";
  og_url: string | null;
  seo: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  sections: Section[];
}
interface CmsPage {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  landing_id: string | null;
  seo: Record<string, unknown>;
  body_html: string | null;
  body_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function emptySEO(): Record<string, unknown> {
  return {
    title: null,
    description: null,
    keywords: null,
    canonical_url: null,
    noindex: false,
    nofollow: false,
    og_title: null,
    og_description: null,
  };
}

export interface CmsMockOptions {
  permissions?: string[];
  roles?: string[];
  landings?: Landing[];
  pages?: CmsPage[];
}

export function landing(id: string, name: string, key: string): Landing {
  return {
    id,
    key,
    name,
    status: "draft",
    og_url: null,
    seo: emptySEO(),
    created_at: MTIME,
    updated_at: MTIME,
    sections: [],
  };
}

export function cmsPage(
  id: string,
  title: string,
  landingId: string | null = null,
): CmsPage {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    status: "draft",
    landing_id: landingId,
    seo: emptySEO(),
    body_html: null,
    body_json: null,
    created_at: MTIME,
    updated_at: MTIME,
  };
}

export async function mockCmsApi(page: Page, opts: CmsMockOptions = {}): Promise<void> {
  const permissions = opts.permissions ?? ["*"];
  const roles = opts.roles ?? ["super_admin"];
  const store: Record<string, Landing> = {};
  for (const l of opts.landings ?? []) store[l.id] = l;
  const pageStore: Record<string, CmsPage> = {};
  for (const p of opts.pages ?? []) pageStore[p.id] = p;
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;

  await page.addInitScript(() => {
    window.localStorage.setItem("velt.local.vne", "en"); // stable English labels
  });

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  const listItem = (l: Landing) => ({
    id: l.id, key: l.key, name: l.name, status: l.status, og_url: l.og_url,
    seo: l.seo, created_at: l.created_at, updated_at: l.updated_at,
  });
  const detail = (l: Landing) => ({ ...listItem(l), sections: l.sections });
  const findSection = (sid: string) =>
    Object.values(store).find((l) => l.sections.some((s) => s.id === sid));

  const pageNode = (p: CmsPage) => ({
    id: p.id, title: p.title, slug: p.slug, parent_id: null, sort_order: 0,
    status: p.status, landing_id: p.landing_id, children: [],
  });
  const pageDetail = (p: CmsPage) => ({
    ...pageNode(p), children: undefined, body_html: p.body_html,
    body_json: p.body_json, template: null, og_path: null, seo: p.seo,
    published_at: null, published_snapshot: null,
    created_at: p.created_at, updated_at: p.updated_at,
  });

  // --- auth bootstrap ---
  await page.route("**/api/auth/refresh", (r) =>
    json(r, 200, { access_token: "e2e-token", token_type: "Bearer", expires_in: 900, user: USER }),
  );
  await page.route("**/api/auth/me", (r) => json(r, 200, { user: USER, roles, permissions }));
  await page.route("**/api/public/settings", (r) => json(r, 200, {}));
  await page.route("**/api/cms/settings", (r) => json(r, 200, { cms: [] }));

  // --- pages: one dispatch route, routed by path + method ---
  await page.route(/\/api\/cms\/pages/, (r) => {
    const req = r.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;
    const rel = path.replace(/^.*\/api\/cms\/pages/, ""); // "" | /{id} | /{id}/publish ...
    const seg = rel.split("/").filter(Boolean);
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : {};

    // /api/cms/pages  (list | create)
    if (seg.length === 0) {
      if (method === "POST") {
        const p = cmsPage(nextId("pg"), String(body.title ?? ""));
        if (body.kind === "landing") {
          // kind=landing → the backend auto-creates + attaches a landing.
          const l = landing(nextId("lp"), p.title, p.slug);
          store[l.id] = l;
          p.landing_id = l.id;
        } else if (typeof body.landing_id === "string") {
          p.landing_id = body.landing_id;
        }
        pageStore[p.id] = p;
        return json(r, 201, pageDetail(p));
      }
      return json(r, 200, Object.values(pageStore).map(pageNode));
    }

    // /api/cms/pages/{id}...
    const p = pageStore[seg[0]];
    if (!p) return json(r, 404, { error: { message: "not_found", details: {} } });
    const sub = seg[1];

    if (!sub) {
      if (method === "PATCH") {
        if (body.title !== undefined) p.title = String(body.title);
        if (body.landing_id !== undefined)
          p.landing_id = (body.landing_id as string | null) || null;
        if (body.seo !== undefined) p.seo = body.seo as Record<string, unknown>;
        p.updated_at = new Date(Date.parse(p.updated_at) + 1000).toISOString();
        return json(r, 200, pageDetail(p));
      }
      if (method === "DELETE") {
        delete pageStore[p.id];
        return r.fulfill({ status: 204, body: "" });
      }
      return json(r, 200, pageDetail(p)); // GET detail
    }
    if (sub === "publish" || sub === "unpublish") {
      p.status = sub === "publish" ? "published" : "draft";
      return json(r, 200, pageDetail(p));
    }
    return json(r, 404, { error: { message: "not_found", details: {} } });
  });

  // --- landing: one dispatch route, routed by path + method ---
  await page.route(/\/api\/cms\/landing/, (r) => {
    const req = r.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;
    const rel = path.replace(/^.*\/api\/cms\/landing/, ""); // "" | /{id} | /{id}/sections | /sections/{sid} | /{id}/publish ...
    const seg = rel.split("/").filter(Boolean);
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : {};

    // /api/cms/landing  (list | create)
    if (seg.length === 0) {
      if (method === "POST") {
        const l = landing(nextId("lp"), String(body.name ?? ""), String(body.key ?? ""));
        store[l.id] = l;
        return json(r, 201, listItem(l));
      }
      return json(r, 200, Object.values(store).map(listItem));
    }

    // /api/cms/landing/sections/{sid}  (update | delete section)
    if (seg[0] === "sections" && seg[1]) {
      const l = findSection(seg[1]);
      if (!l) return json(r, 404, { error: { message: "not_found", details: {} } });
      if (method === "DELETE") {
        l.sections = l.sections.filter((s) => s.id !== seg[1]);
        return r.fulfill({ status: 204, body: "" });
      }
      const s = l.sections.find((x) => x.id === seg[1])!;
      if (body.config !== undefined) s.config = body.config as Record<string, unknown>;
      if (body.is_visible !== undefined) s.is_visible = Boolean(body.is_visible);
      return json(r, 200, detail(l));
    }

    // /api/cms/landing/{id}...
    const l = store[seg[0]];
    if (!l) return json(r, 404, { error: { message: "not_found", details: {} } });
    const sub = seg[1];

    if (!sub) {
      if (method === "PATCH") {
        if (body.name !== undefined) l.name = String(body.name);
        if (body.key !== undefined) l.key = String(body.key);
        if (body.seo !== undefined) l.seo = body.seo as Record<string, unknown>;
        l.updated_at = new Date(Date.parse(l.updated_at) + 1000).toISOString();
        return json(r, 200, listItem(l));
      }
      if (method === "DELETE") {
        delete store[l.id];
        return r.fulfill({ status: 204, body: "" });
      }
      return json(r, 200, detail(l)); // GET detail
    }

    if (sub === "sections" && seg[2] === "order") {
      const ids = (body.section_ids as string[]) ?? [];
      l.sections.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      l.sections.forEach((s, i) => (s.sort_order = i));
      return json(r, 200, detail(l));
    }
    if (sub === "sections") {
      const s: Section = {
        id: nextId("sec"),
        type: String(body.type),
        sort_order: l.sections.length,
        is_visible: body.is_visible === undefined ? true : Boolean(body.is_visible),
        config: (body.config as Record<string, unknown>) ?? {},
      };
      l.sections.push(s);
      return json(r, 201, detail(l));
    }
    if (sub === "publish") {
      l.status = "published";
      l.updated_at = new Date(Date.parse(l.updated_at) + 1000).toISOString();
      return json(r, 200, detail(l));
    }
    if (sub === "unpublish") {
      l.status = "draft";
      return json(r, 200, detail(l));
    }
    if (sub === "upload") {
      return json(r, 200, { path: "cms/landing/x.png", url: "https://cdn.test/cms/landing/x.png" });
    }
    return json(r, 404, { error: { message: "not_found", details: {} } });
  });
}
