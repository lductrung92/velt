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
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// The endpoint returns a flat `{ "<key>": value }` map. Adapt the dotted keys we
// care about into a typed shape; unknown keys are ignored.
function adapt(raw: Record<string, unknown>): AppConfig {
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
  };
}

export const appConfigKey = ["public-config"] as const;

export function useAppConfig() {
  return useQuery({
    queryKey: appConfigKey,
    queryFn: async () => {
      const { data } =
        await api.get<Record<string, unknown>>("/public/settings");
      return adapt(data);
    },
    staleTime: 5 * 60_000, // public config rarely changes; avoid refetch churn
  });
}
