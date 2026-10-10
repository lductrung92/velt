import api from "@/services/api";
import type { SessionResponse, UserResponse } from "@/store/auth.store";

// Response shapes — mirror the Go backend exactly (contract-first,
// docs/apis/auth-api.md + backend/internal/modules/auth/handler.go).

// Login / 2FA-verify / refresh all return the shared session shape.
export type LoginSuccess = SessionResponse;

export interface TwoFactorChallenge {
  two_factor_required: true;
  challenge_token: string;
}

export type LoginResult = LoginSuccess | TwoFactorChallenge;

export interface MeResponse {
  user: UserResponse;
  roles: string[];
  permissions: string[];
}

export function isTwoFactorChallenge(r: LoginResult): r is TwoFactorChallenge {
  return "two_factor_required" in r && r.two_factor_required;
}

export const authService = {
  // Step 1. Returns either tokens or a 2FA challenge.
  async login(email: string, password: string): Promise<LoginResult> {
    const { data } = await api.post<LoginResult>("/auth/login", {
      email,
      password,
    });
    return data;
  },

  // Step 2. code = 6-digit TOTP or a recovery code.
  async verifyTwoFactor(
    challenge_token: string,
    code: string,
  ): Promise<LoginSuccess> {
    const { data } = await api.post<LoginSuccess>("/auth/2fa/verify", {
      challenge_token,
      code,
    });
    return data;
  },

  // Refresh rides the httpOnly cookie (no body). Returns fresh tokens + user.
  async refresh(): Promise<LoginSuccess> {
    const { data } = await api.post<LoginSuccess>("/auth/refresh", {});
    return data;
  },

  async me(): Promise<MeResponse> {
    const { data } = await api.get<MeResponse>("/auth/me");
    return data;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout", {});
  },

  // Revokes EVERY session (including the current one) — caller redirects to /login.
  async logoutAll(): Promise<void> {
    await api.post("/auth/logout-all", {});
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post("/auth/forgot-password", { email });
  },

  async resetPassword(token: string, new_password: string): Promise<void> {
    await api.post("/auth/reset-password", { token, new_password });
  },
};
