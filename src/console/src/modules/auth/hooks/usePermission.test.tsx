import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/store/auth.store";

import { usePermission } from "./usePermission";

beforeEach(() => useAuthStore.getState().clear());

describe("usePermission", () => {
  it("matches concrete permissions/roles", () => {
    useAuthStore.getState().setAuthz(["admin"], ["users.read", "users.create"]);
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasPermission("users.read")).toBe(true);
    expect(result.current.hasPermission("users.delete")).toBe(false);
    expect(
      result.current.hasAnyPermission(["users.delete", "users.create"]),
    ).toBe(true);
    expect(
      result.current.hasAllPermissions(["users.read", "users.create"]),
    ).toBe(true);
    expect(
      result.current.hasAllPermissions(["users.read", "users.delete"]),
    ).toBe(false);
    expect(result.current.hasRole("admin")).toBe(true);
    expect(result.current.hasRole("super_admin")).toBe(false);
  });

  it("treats '*' as grant-all (super_admin) — F2", () => {
    useAuthStore.getState().setAuthz(["super_admin"], ["*"]);
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasPermission("users.read")).toBe(true);
    expect(result.current.hasPermission("anything.at.all")).toBe(true);
    expect(result.current.hasAnyPermission(["x"])).toBe(true);
    expect(result.current.hasAllPermissions(["a", "b", "c"])).toBe(true);
  });

  it("denies everything when authz is empty", () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasPermission("users.read")).toBe(false);
    expect(result.current.hasAnyPermission(["users.read"])).toBe(false);
  });
});
