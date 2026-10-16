import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  appConfigFrom,
  appConfigKey,
  type AppConfig,
} from "@/app/useAppConfig";
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
      full
        ? settingsService.update(updates)
        : settingsService.updateScoped(updates),
    // The server answers with the fresh view; seeding the cache with it is what
    // clears the form's dirty state without a second round trip.
    onSuccess: (data: SettingsView) => {
      qc.setQueryData(settingsKeys.all(scoped), data);
      // Several of these keys are ALSO the console's own runtime config — the
      // brand name and logo, and how every list table pages. That copy is a
      // different query, read from an endpoint the browser is told it may cache
      // for a minute, so refetching it would have answered with the values that
      // were just replaced. The response in hand is the newer truth.
      qc.setQueryData<AppConfig>(appConfigKey, (prev) => ({
        ...prev,
        ...defined(appConfigFrom(flatten(data))),
      }));
    },
  });
}

/** The grouped view as the flat `{key: value}` map the adapter reads. */
function flatten(view: SettingsView): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entries of Object.values(view)) {
    for (const entry of entries) {
      if (entry.value !== undefined) out[entry.key] = entry.value;
    }
  }
  return out;
}

/**
 * Only the fields the response actually carried. A scoped editor sees a subset
 * of the groups, and spreading the absent ones as undefined would wipe values
 * this query already holds.
 */
function defined(config: AppConfig): Partial<AppConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  );
}

export function usePurgeCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => settingsService.purgeCache(),
    // Our own copy of the runtime config is one of the things that was allowed
    // to be stale, so it goes first.
    onSuccess: () => qc.invalidateQueries({ queryKey: appConfigKey }),
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: (to: string) => settingsService.testEmail(to),
  });
}
