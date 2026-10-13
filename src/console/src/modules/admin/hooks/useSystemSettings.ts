import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermission } from "@/modules/auth";

import {
  settingsService,
  type SettingUpdate,
  type SettingsView,
} from "../services/settings.service";

export const settingsKeys = {
  all: (scoped: boolean) => ["system-settings", scoped] as const,
};

/**
 * The settings screen reads through whichever door the signed-in person owns.
 *
 * `settings.manage` is the whole registry — the server's own configuration is
 * in there, so it is an administrator's permission. An editor with
 * `cms.settings.manage` gets the same screen through the CMS-scoped endpoint,
 * which answers with the site's groups only and refuses to write anything else.
 * Deciding here rather than in the screen keeps one component for both.
 */
export function useSettingsAccess() {
  const { hasPermission } = usePermission();
  const full = hasPermission("settings.manage");
  const scoped = !full && hasPermission("cms.settings.manage");
  return { full, scoped, canRead: full || scoped };
}

export function useSystemSettings() {
  const { full, scoped, canRead } = useSettingsAccess();
  return useQuery({
    queryKey: settingsKeys.all(scoped),
    queryFn: () => (full ? settingsService.get() : settingsService.getScoped()),
    enabled: canRead,
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  const { full, scoped } = useSettingsAccess();
  return useMutation({
    mutationFn: (updates: SettingUpdate) =>
      full ? settingsService.update(updates) : settingsService.updateScoped(updates),
    // The server answers with the fresh view; seeding the cache with it is what
    // clears the form's dirty state without a second round trip.
    onSuccess: (data: SettingsView) =>
      qc.setQueryData(settingsKeys.all(scoped), data),
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: (to: string) => settingsService.testEmail(to),
  });
}
