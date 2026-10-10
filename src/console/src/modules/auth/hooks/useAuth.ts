import { useMutation } from "@tanstack/react-query";

import { queryClient } from "@/app/queryClient";
import { useAuthStore } from "@/store/auth.store";

import {
  authService,
  isTwoFactorChallenge,
  type LoginResult,
} from "../services/auth.service";

// The login / 2FA responses carry no roles/permissions, so after establishing
// the session we must fetch /auth/me to hydrate authz — otherwise every
// permission gate sees an empty set until a hard refresh (F1). Best-effort: a
// transient /me failure still leaves the user logged in; gated UI just stays
// hidden until the next authz load.
async function hydrateAuthz(setAuthz: (r: string[], p: string[]) => void) {
  try {
    const me = await authService.me();
    setAuthz(me.roles, me.permissions);
  } catch {
    // keep the session; authz remains empty until re-hydrated
  }
}

// Login (step 1). On a non-2FA success the session + authz are established here;
// on a 2FA challenge the caller advances to step 2. Business orchestration lives
// in the hook (architecture.md: Component → Hook → Service → API client).
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const setAuthz = useAuthStore((s) => s.setAuthz);
  return useMutation<LoginResult, unknown, { email: string; password: string }>(
    {
      mutationFn: ({ email, password }) => authService.login(email, password),
      onSuccess: async (result) => {
        if (!isTwoFactorChallenge(result)) {
          setSession(result.user, result.access_token);
          await hydrateAuthz(setAuthz);
        }
      },
    },
  );
}

// Login (step 2 — 2FA). Establishes session + authz on success.
export function useVerifyTwoFactor() {
  const setSession = useAuthStore((s) => s.setSession);
  const setAuthz = useAuthStore((s) => s.setAuthz);
  return useMutation<
    Awaited<ReturnType<typeof authService.verifyTwoFactor>>,
    unknown,
    { challengeToken: string; code: string }
  >({
    mutationFn: ({ challengeToken, code }) =>
      authService.verifyTwoFactor(challengeToken, code),
    onSuccess: async (res) => {
      setSession(res.user, res.access_token);
      await hydrateAuthz(setAuthz);
    },
  });
}

// Logout. Revokes the session server-side, then clears local auth state AND the
// React Query cache (so a next user on a shared device can't see cached data).
// onSettled runs on success OR failure — the user always ends up signed out.
export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation<void, unknown, void>({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}

// Logout everywhere — revokes ALL sessions (incl. the current one), then clears
// local auth + query cache. The caller redirects to /login.
export function useLogoutAll() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation<void, unknown, void>({
    mutationFn: () => authService.logoutAll(),
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}

// Forgot password — always resolves to a generic success (BE returns 200 for
// any email; anti-enumeration).
export function useForgotPassword() {
  return useMutation<void, unknown, { email: string }>({
    mutationFn: ({ email }) => authService.forgotPassword(email),
  });
}

// Reset password — on success the BE revokes all sessions; the caller
// redirects to /login.
export function useResetPassword() {
  return useMutation<void, unknown, { token: string; newPassword: string }>({
    mutationFn: ({ token, newPassword }) =>
      authService.resetPassword(token, newPassword),
  });
}
