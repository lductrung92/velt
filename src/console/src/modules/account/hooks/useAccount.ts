import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/store/auth.store";

import { accountService } from "../services/account.service";
import { accountKeys } from "./accountKeys";

// Load the caller's profile (+ 2FA status). Drives the profile + 2FA screens.
export function useProfile() {
  return useQuery({
    queryKey: accountKeys.profile(),
    queryFn: () => accountService.getProfile(),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => accountService.updateProfile(fullName),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile() }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => accountService.uploadAvatar(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile() }),
  });
}

export function useDeleteAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => accountService.deleteAvatar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile() }),
  });
}

// Change password. On success the BE rotates the current session (keeps it) and
// revokes the others; we swap the in-memory access token so this tab is NOT
// logged out (docs/screens/account-change-password/workflows §2).
export function useChangePassword() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      accountService.changePassword(vars.currentPassword, vars.newPassword),
    onSuccess: (res) => setAccessToken(res.access_token),
  });
}

export function useSetupTwoFactor() {
  return useMutation({ mutationFn: () => accountService.setupTwoFactor() });
}

export function useEnableTwoFactor() {
  return useMutation({
    mutationFn: (code: string) => accountService.enableTwoFactor(code),
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => accountService.disableTwoFactor(password),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.profile() }),
  });
}

export function useRegenerateRecoveryCodes() {
  return useMutation({
    mutationFn: (password: string) =>
      accountService.regenerateRecoveryCodes(password),
  });
}
