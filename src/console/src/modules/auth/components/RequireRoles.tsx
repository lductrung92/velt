import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { usePermission } from "../hooks/usePermission";

// Route-level RBAC gate by role. Renders children only if the user holds the
// required role(s); otherwise redirects (default "/"). Display-only — the API
// is the authority. Must be used INSIDE a ProtectedRoute.
//
// NOTE: `fallback` MUST be a route reachable WITHOUT this gate, otherwise an
// unauthorized user redirects into the same gate and loops.
export function RequireRoles({
  roles,
  mode = "any",
  fallback = "/",
  children,
}: {
  roles: string | string[];
  /** "any" (default) requires at least one role; "all" requires every role. */
  mode?: "all" | "any";
  fallback?: string;
  children: ReactNode;
}) {
  const { hasAllRoles, hasAnyRole } = usePermission();
  const list = Array.isArray(roles) ? roles : [roles];
  const ok = mode === "all" ? hasAllRoles(list) : hasAnyRole(list);

  if (!ok) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
