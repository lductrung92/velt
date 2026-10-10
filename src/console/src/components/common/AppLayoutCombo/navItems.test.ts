import { describe, expect, it } from "vitest";

import { activeBranchKey, visibleNavSections } from "./navItems";

const sec = (perms: string[], roles: string[] = []) =>
  visibleNavSections(new Set(perms), new Set(roles));

describe("visibleNavSections", () => {
  it("super_admin sees both sections with the full admin branch", () => {
    const sections = sec(["*"]);
    expect(sections.map((s) => s.key)).toEqual(["overview", "system"]);

    const system = sections.find((s) => s.key === "system");
    const admin = system?.items.find((i) => i.key === "admin");
    expect(admin?.children?.map((c) => c.path)).toEqual([
      "/admin/users",
      "/admin/roles",
      "/admin/sessions",
    ]);
  });

  it("shows the cms branch under overview only with a cms permission", () => {
    const overview = sec(["cms.menu.manage"]).find((s) => s.key === "overview");
    const cms = overview?.items.find((i) => i.key === "cms");
    expect(cms?.children?.map((c) => c.path)).toEqual(["/cms/menus"]);
  });

  it("drops every section when nothing in them is visible", () => {
    // Every nav entry is permission-gated, so no permissions → empty sidebar.
    expect(sec([]).map((s) => s.key)).toEqual([]);
    expect(sec(["profile.read"]).map((s) => s.key)).toEqual([]);
  });

  it("drops the admin branch's hidden children but keeps visible ones", () => {
    const sections = sec(["users.read"]);
    const admin = sections
      .find((s) => s.key === "system")
      ?.items.find((i) => i.key === "admin");
    expect(admin?.children?.map((c) => c.path)).toEqual(["/admin/users"]);
  });

  it("drops the overview section when no cms child is visible", () => {
    const sections = sec(["users.read"]);
    expect(sections.map((s) => s.key)).toEqual(["system"]);
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

  it("returns null for leaf / unknown routes", () => {
    expect(activeBranchKey("/")).toBeNull();
    expect(activeBranchKey("/nope")).toBeNull();
  });
});
