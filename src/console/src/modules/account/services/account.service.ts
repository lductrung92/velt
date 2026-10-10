import api from "@/services/api";
import type { UserResponse } from "@/store/auth.store";

// Response shapes — mirror the Go backend exactly (contract-first,
// docs/apis/account-api.md + backend/internal/modules/account).

export interface ProfileResponse {
  user: UserResponse;
  two_factor_enabled: boolean;
  /** Unused recovery codes when 2FA is on; null when off. */
  recovery_codes_remaining: number | null;
}

export interface UpdateProfileResponse {
  user: UserResponse;
}

export interface AvatarResponse {
  avatar_url: string;
}

export interface ChangePasswordResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface Setup2faResponse {
  otpauth_url: string;
  qr_svg: string;
  manual_key: string;
}

export interface RecoveryCodesResponse {
  recovery_codes: string[];
}

export const accountService = {
  async getProfile(): Promise<ProfileResponse> {
    const { data } = await api.get<ProfileResponse>("/account/profile");
    return data;
  },

  async updateProfile(fullName: string): Promise<UpdateProfileResponse> {
    const { data } = await api.patch<UpdateProfileResponse>(
      "/account/profile",
      {
        full_name: fullName,
      },
    );
    return data;
  },

  // postForm builds multipart FormData (field "file") with the correct boundary,
  // overriding the instance's default application/json content type.
  async uploadAvatar(file: File): Promise<AvatarResponse> {
    const { data } = await api.postForm<AvatarResponse>("/account/avatar", {
      file,
    });
    return data;
  },

  async deleteAvatar(): Promise<void> {
    await api.delete("/account/avatar");
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    const { data } = await api.post<ChangePasswordResponse>(
      "/account/change-password",
      { current_password: currentPassword, new_password: newPassword },
    );
    return data;
  },

  async setupTwoFactor(): Promise<Setup2faResponse> {
    const { data } = await api.post<Setup2faResponse>("/account/2fa/setup", {});
    return data;
  },

  async enableTwoFactor(code: string): Promise<RecoveryCodesResponse> {
    const { data } = await api.post<RecoveryCodesResponse>(
      "/account/2fa/enable",
      {
        code,
      },
    );
    return data;
  },

  async disableTwoFactor(password: string): Promise<void> {
    await api.post("/account/2fa/disable", { password });
  },

  async regenerateRecoveryCodes(
    password: string,
  ): Promise<RecoveryCodesResponse> {
    const { data } = await api.post<RecoveryCodesResponse>(
      "/account/2fa/recovery-codes",
      { password },
    );
    return data;
  },
};
