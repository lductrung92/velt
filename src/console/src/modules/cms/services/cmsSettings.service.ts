import api from "@/services/api";

// CMS feature flags live in the shared settings registry (group "cms") but are
// reached ONLY through the cms-api (gated cms.settings.*, NOT settings.manage) —
// docs/apis/cms-api.md §9. The response is a GroupedView: one "cms" group of
// entry-objects (NOT a flat key→bool map). All CMS flags are booleans.
export interface CmsSettingEntry {
  key: string;
  type: string;
  value?: unknown;
}

export type CmsSettingsView = Record<string, CmsSettingEntry[]>;

export const cmsSettingsService = {
  async get(): Promise<CmsSettingsView> {
    const { data } = await api.get<CmsSettingsView>("/cms/settings");
    return data;
  },

  // PUT only the changed settings: `{ updates: { "cms.key": bool | string, … } }`
  // (booleans for feature flags, strings for values like the homepage slug). An
  // empty `updates` is a valid no-op. The server returns the fresh "cms" group.
  async update(
    updates: Record<string, boolean | string>,
  ): Promise<CmsSettingsView> {
    const { data } = await api.put<CmsSettingsView>("/cms/settings", {
      updates,
    });
    return data;
  },
};
