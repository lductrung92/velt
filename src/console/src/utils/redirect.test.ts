import { describe, expect, it } from "vitest";

import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("allows a same-origin relative path (with query)", () => {
    expect(safeRedirect("/admin/users?page=2")).toBe("/admin/users?page=2");
  });

  it("falls back to / for empty/null/undefined", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });

  it("rejects protocol-relative //", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
  });

  it("rejects scheme-y payloads", () => {
    expect(safeRedirect("http://evil.com")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
  });

  it("rejects backslash (browser may normalize \\ to /) — F7", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("\\\\evil.com")).toBe("/");
  });

  it("rejects a non-rooted relative path", () => {
    expect(safeRedirect("admin/users")).toBe("/");
  });
});
