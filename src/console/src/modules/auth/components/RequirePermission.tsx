import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { usePermission } from "../hooks/usePermission";

// Route-level RBAC gate by permission. Renders children only if the user holds
// the required permission(s); otherwise redirects (default "/"). Display-only —
// the API is the authority. Must be used INSIDE a ProtectedRoute (assumes the
// session is already restored).
//
// NOTE: `fallback` MUST be a route reachable WITHOUT this gate (e.g. "/"),
// otherwise an unauthorized user redirects into the same gate and loops.
export function RequirePermission({
  permission,
  mode = "all",
  fallback = "/",
  children,
}: {
  permission: string | string[];
  /** "all" (default) requires every permission; "any" requires at least one. */
  mode?: "all" | "any";
  fallback?: string;
  children: ReactNode;
}) {
  const { hasAllPermissions, hasAnyPermission } = usePermission();
  const perms = Array.isArray(permission) ? permission : [permission];
  const ok =
    mode === "any" ? hasAnyPermission(perms) : hasAllPermissions(perms);

  if (!ok) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
