import { useAuthStore } from "@/store/auth.store";

// Display-only RBAC helpers. The backend re-validates authorization on every
// request — these only shape the UI (console-react.md §Auth). /auth/me returns
// the user's effective permission set; super_admin's set is literally ["*"]
// (the backend mirrors this in Identity.Has), so the client MUST treat "*" as
// grant-all — otherwise super_admin fails every concrete check. Wildcard
// expansion deliberately lives on the client (see docs/apis/auth-api.md).
export function usePermission() {
  const roles = useAuthStore((s) => s.roles);
  const permissions = useAuthStore((s) => s.permissions);

  const isSuper = permissions.includes("*");
  const hasPermission = (perm: string) => isSuper || permissions.includes(perm);
  const hasAnyPermission = (perms: string[]) =>
    isSuper || perms.some((p) => permissions.includes(p));
  const hasAllPermissions = (perms: string[]) =>
    isSuper || perms.every((p) => permissions.includes(p));
  const hasRole = (role: string) => roles.includes(role);
  const hasAnyRole = (list: string[]) => list.some((r) => roles.includes(r));
  const hasAllRoles = (list: string[]) => list.every((r) => roles.includes(r));

  return {
    roles,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    hasAllRoles,
  };
}
