import { useQuery } from "@tanstack/react-query";

import api from "@/services/api";

// Public, unauthenticated branding/runtime config — the IsPublic subset of the
// settings registry (GET /api/public/settings). Edge-cacheable (ETag + max-age);
// it drives runtime theming + the locale switcher, so it loads on every page
// (auth not required) and is shared via a single React Query key.
export interface AppConfig {
  appName?: string;
  logoUrl?: string;
  primaryColor?: string;
  defaultLocale?: string;
  languageSwitcherEnabled?: boolean;
  /** Content translation (translation.enabled) — drives the editor language tabs. */
  translationEnabled?: boolean;
  /** Languages besides Vietnamese, parsed from the comma-separated setting. */
  translationLocales?: string[];
  /** Rows per page in the console's list tables (app.page_size). */
  pageSize?: number;
  /** How those tables offer the next rows (app.pagination_template). */
  paginationTemplate?: string;
  /** How often this config is re-read (cache.console_refresh_seconds). */
  consoleRefreshSeconds?: number;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// The endpoint returns a flat `{ "<key>": value }` map. Adapt the dotted keys we
// care about into a typed shape; unknown keys are ignored.
//
// Exported because the settings screen holds the same values in its own
// response: seeding this query from there is what makes a saved change take
// effect at once. The endpoint is sent with max-age=60, so a refetch would be
// answered from the browser's cache for up to a minute — which read, on screen,
// as the setting not working.
export function appConfigFrom(raw: Record<string, unknown>): AppConfig {
  return {
    appName: asString(raw["app.name"]),
    logoUrl: asString(raw["app.logo_url"]),
    primaryColor: asString(raw["app.primary_color"]),
    defaultLocale: asString(raw["app.default_locale"]),
    languageSwitcherEnabled:
      typeof raw["app.language_switcher_enabled"] === "boolean"
        ? (raw["app.language_switcher_enabled"] as boolean)
        : undefined,
    translationEnabled: raw["translation.enabled"] === true,
    translationLocales: asString(raw["translation.locales"])
      ?.split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
    pageSize: asNumber(raw["app.page_size"]),
    paginationTemplate: asString(raw["app.pagination_template"]),
    consoleRefreshSeconds: asNumber(raw["cache.console_refresh_seconds"]),
  };
}

export const appConfigKey = ["public-config"] as const;

export function useAppConfig() {
  return useQuery({
    queryKey: appConfigKey,
    queryFn: async () => {
      const { data } =
        await api.get<Record<string, unknown>>("/public/settings");
      return appConfigFrom(data);
    },
    staleTime: 5 * 60_000, // public config rarely changes; avoid refetch churn
    // A tab that is already open would otherwise keep yesterday's settings
    // until somebody reloaded it. How often to look is itself a setting, read
    // from the answer this query is holding (Settings → Cache); 0 turns it off
    // and restores "only on reload".
    refetchInterval: (query) => {
      const seconds = query.state.data?.consoleRefreshSeconds;
      return seconds && seconds > 0 ? seconds * 1000 : false;
    },
  });
}
