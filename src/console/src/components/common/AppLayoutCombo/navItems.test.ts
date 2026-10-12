import { describe, expect, it } from "vitest";

import { activeBranchKey, visibleNavSections } from "./navItems";

const sec = (perms: string[], roles: string[] = []) =>
  visibleNavSections(new Set(perms), new Set(roles));

describe("visibleNavSections", () => {
  it("super_admin sees every section with the full admin branch", () => {
    const sections = sec(["*"]);
    expect(sections.map((s) => s.key)).toEqual(["overview", "system"]);

    const overview = sections.find((s) => s.key === "overview");
    expect(overview?.items.map((i) => i.key)).toEqual([
      "dashboard",
      "cms",
      "chat",
      "leads",
      "catalog",
    ]);

    const system = sections.find((s) => s.key === "system");
    const admin = system?.items.find((i) => i.key === "admin");
    expect(admin?.children?.map((c) => c.path)).toEqual([
      "/admin/users",
      "/admin/roles",
      "/admin/sessions",
      "/admin/ai",
    ]);
  });

  it("shows the cms branch under overview only with a cms permission", () => {
    const overview = sec(["cms.menu.manage"]).find((s) => s.key === "overview");
    const cms = overview?.items.find((i) => i.key === "cms");
    expect(cms?.children?.map((c) => c.path)).toEqual(["/cms/menus"]);
  });

  it("keeps the dashboard available without module permissions", () => {
    expect(sec([])[0].items.map((item) => item.key)).toEqual(["dashboard"]);
    expect(sec(["profile.read"])[0].items.map((item) => item.key)).toEqual([
      "dashboard",
    ]);
  });

  it("drops the admin branch's hidden children but keeps visible ones", () => {
    const sections = sec(["users.read"]);
    const admin = sections
      .find((s) => s.key === "system")
      ?.items.find((i) => i.key === "admin");
    expect(admin?.children?.map((c) => c.path)).toEqual(["/admin/users"]);
  });

  it("keeps the dashboard when neither overview branch has a visible child", () => {
    const sections = sec(["users.read"]);
    expect(sections.map((s) => s.key)).toEqual(["overview", "system"]);
  });

  it("shows the catalog branch under overview with products.view", () => {
    const overview = sec(["products.view"]).find((s) => s.key === "overview");
    expect(overview?.items.map((i) => i.key)).toEqual(["dashboard", "catalog"]);
    const catalog = overview?.items.find((i) => i.key === "catalog");
    expect(catalog?.children?.map((c) => c.path)).toEqual([
      "/products",
      "/product-categories",
    ]);
  });

  it("puts members under the system section, not catalog", () => {
    // Team profiles are configuration, not catalog content.
    const sections = sec(["members.view"]);
    expect(sections.map((s) => s.key)).toEqual(["overview", "system"]);
    expect(
      sections.find((s) => s.key === "system")?.items.map((i) => i.key),
    ).toEqual(["members"]);
  });

  it("gates the AI assistant behind settings.manage, not a bespoke permission", () => {
    // An API key is a billing credential — the same class as the SMTP
    // password, which settings.manage already guards.
    const admin = sec(["settings.manage"])
      .find((s) => s.key === "system")
      ?.items.find((i) => i.key === "admin");
    expect(admin?.children?.map((c) => c.path)).toEqual(["/admin/ai"]);

    const withoutIt = sec(["users.read"])
      .find((s) => s.key === "system")
      ?.items.find((i) => i.key === "admin");
    expect(withoutIt?.children?.map((c) => c.path)).not.toContain("/admin/ai");
  });

  it("puts the inbox and leads under overview, not admin", () => {
    // Both are day-to-day work. Quản trị is configuration, and a screen staff
    // live in all day does not belong there.
    const sections = sec(["ai.chat.handle", "crm.leads.view_all"]);
    expect(
      sections.find((s) => s.key === "overview")?.items.map((i) => i.key),
      // dashboard carries no permission, so it is always there.
    ).toEqual(["dashboard", "chat", "leads"]);
    expect(sections.map((s) => s.key)).toEqual(["overview"]);
  });
});

describe("activeBranchKey", () => {
  it("maps an admin child path to the admin branch", () => {
    expect(activeBranchKey("/admin/users")).toBe("admin");
    expect(activeBranchKey("/admin/roles/r1")).toBe("admin");
  });

  it("maps a cms child path to the cms branch", () => {
    expect(activeBranchKey("/cms/articles")).toBe("cms");
  });

  it("maps a catalog child path to the catalog branch", () => {
    expect(activeBranchKey("/products")).toBe("catalog");
    expect(activeBranchKey("/products/p1")).toBe("catalog");
    expect(activeBranchKey("/product-categories")).toBe("catalog");
    expect(activeBranchKey("/product-categories/c1")).toBe("catalog");
  });

  it("returns null for leaf / unknown routes", () => {
    expect(activeBranchKey("/")).toBeNull();
    expect(activeBranchKey("/nope")).toBeNull();
  });
});
