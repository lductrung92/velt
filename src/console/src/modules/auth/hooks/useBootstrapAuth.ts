import { useEffect, useRef, useState } from "react";

import { useAuthStore } from "@/store/auth.store";

import { authService } from "../services/auth.service";

// First-load session restore. The access token is never persisted (in-memory
// only — console-react.md §Auth), so on a fresh page load we try /auth/refresh
// against the httpOnly refresh cookie to mint a new session, then /auth/me to
// load roles + permissions. Any failure means "not signed in" and we proceed
// to render (ProtectedRoute then redirects to /login).
//
// Returns `false` until the attempt settles, so route guards don't bounce a
// returning user before the session is restored.
export function useBootstrapAuth(): boolean {
  const [ready, setReady] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const setAuthz = useAuthStore((s) => s.setAuthz);
  const clear = useAuthStore((s) => s.clear);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard StrictMode's double-invoke in dev
    started.current = true;

    void (async () => {
      try {
        const session = await authService.refresh();
        setSession(session.user, session.access_token);
        const me = await authService.me();
        setAuthz(me.roles, me.permissions);
      } catch {
        // No/expired refresh cookie, OR a refresh that succeeded but /me failed:
        // never leave a half-restored session (user set, authz empty). Clear so
        // the app treats this as signed-out (ProtectedRoute → /login). (F5)
        clear();
      } finally {
        setReady(true);
      }
    })();
  }, [setSession, setAuthz, clear]);

  return ready;
}
