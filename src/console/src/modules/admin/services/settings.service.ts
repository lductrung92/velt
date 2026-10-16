import api from "@/services/api";

/**
 * The system settings, as the registry describes them.
 *
 * The API returns one entry per key with the metadata a form needs — type,
 * format, allowed values, whether it is public, whether a secret is set — so
 * the screen renders itself from the response instead of listing keys. A key
 * added to the backend registry therefore shows up without touching the
 * console, which is the whole point of having a registry.
 */
export interface SettingEntry {
  key: string;
  type: "string" | "int" | "bool" | "json" | "secret" | "enum";
  /** Present for enums. */
  allowed_values?: string[];
  /** "url" | "email" — a hint for the input, not a validation rule. */
  format?: string;
  /** True when the public site may read this key without auth. */
  is_public?: boolean;
  /** Secrets carry no value, only whether one is stored. */
  is_set?: boolean;
  value?: unknown;
}

/** group → entries, in registry order. */
export type SettingsView = Record<string, SettingEntry[]>;

export type SettingUpdate = Record<string, string | number | boolean | null>;

export const settingsService = {
  async get(): Promise<SettingsView> {
    const { data } = await api.get<SettingsView>("/settings");
    return data;
  },

  /**
   * Ends the current wait: drops the snapshot the API caches and moves the
   * token the public site polls, so neither keeps serving what was replaced.
   * Changes no setting's value.
   */
  async purgeCache(): Promise<void> {
    await api.post("/settings/cache/purge");
  },

  async update(updates: SettingUpdate): Promise<SettingsView> {
    const { data } = await api.put<SettingsView>("/settings", { updates });
    return data;
  },

  /**
   * The CMS-scoped read/write, for somebody who may edit the site's content
   * settings but not the server's. It answers with the groups that screen owns
   * (cms, site, seo, translation) and refuses every other key.
   */
  async getScoped(): Promise<SettingsView> {
    const { data } = await api.get<SettingsView>("/cms/settings");
    return data;
  },

  async updateScoped(updates: SettingUpdate): Promise<SettingsView> {
    const { data } = await api.put<SettingsView>("/cms/settings", { updates });
    return data;
  },

  /** Sends a test message with the SMTP settings as they are STORED. */
  async testEmail(to: string): Promise<void> {
    await api.post("/settings/email/test", { to });
  },
};
