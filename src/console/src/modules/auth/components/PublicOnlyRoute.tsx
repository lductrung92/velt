import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { useAuthStore } from "@/store/auth.store";
import { safeRedirect } from "@/utils/redirect";

// Pre-auth pages (/login, /forgot-password, /reset-password): if already
// authenticated, bounce to the safe redirect target (or "/").
// docs/screens/auth-login/workflows.md §0/§4.
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  if (user) {
    return <Navigate to={safeRedirect(params.get("redirect"))} replace />;
  }
  return <>{children}</>;
}
