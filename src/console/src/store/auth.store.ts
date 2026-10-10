import { create } from "zustand";

// UserResponse mirrors the backend auth.UserResponse (contract-first —
// docs/apis/auth-api.md). Never invent fields the API doesn't return.
export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: "active" | "disabled" | "locked";
  created_at: string;
  last_login_at: string | null;
}

// Shape returned by every endpoint that establishes or rotates a session
// (login, 2FA verify, refresh). Contract-first — mirrors the Go handlers. Lives
// here (a leaf both the api client and the auth service already import) so the
// type isn't duplicated across them (F10).
export interface SessionResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: UserResponse;
}

export type AuthStatus = "idle" | "authenticated";

interface AuthState {
  user: UserResponse | null;
  /** Short-lived access token — IN MEMORY ONLY (never localStorage/cookie).
   *  docs/ai/console-react.md §Auth. The refresh token lives in an httpOnly
   *  cookie the backend manages; JS can't read it. */
  accessToken: string | null;
  roles: string[];
  permissions: string[];
  status: AuthStatus;

  setSession: (
    user: UserResponse,
    accessToken: string,
    roles?: string[],
    permissions?: string[],
  ) => void;
  setAccessToken: (accessToken: string) => void;
  setAuthz: (roles: string[], permissions: string[]) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  roles: [],
  permissions: [],
  status: "idle",

  setSession: (user, accessToken, roles, permissions) =>
    set((s) => ({
      user,
      accessToken,
      roles: roles ?? s.roles,
      permissions: permissions ?? s.permissions,
      status: "authenticated",
    })),

  setAccessToken: (accessToken) => set({ accessToken }),

  setAuthz: (roles, permissions) => set({ roles, permissions }),

  clear: () =>
    set({
      user: null,
      accessToken: null,
      roles: [],
      permissions: [],
      status: "idle",
    }),
}));
