import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { WidgetSelect } from "./WidgetSelect";

// Config shape for the games_list widget (mirrors the backend resolver +
// docs/domains/cms/widgets.md §2). Filters are free-text taxonomy keys for v1.
export interface GamesListConfig {
  title?: string;
  filters?: {
    age_group?: string;
    subject?: string;
    skill?: string;
    q?: string;
  };
  limit?: number;
  columns?: number;
  layout?: "grid" | "carousel";
}

export function GamesListForm({
  value,
  onChange,
  disabled = false,
}: {
  value: GamesListConfig;
  onChange: (v: GamesListConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const f = value.filters ?? {};
  const set = (patch: Partial<GamesListConfig>) =>
    onChange({ ...value, ...patch });
  const setF = (patch: Partial<NonNullable<GamesListConfig["filters"]>>) =>
    onChange({ ...value, filters: { ...f, ...patch } });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="gl-title">
          {t("cms.pages.widget.games_list.heading")}
        </Label>
        <Input
          id="gl-title"
          value={value.title ?? ""}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="gl-age">
          {t("cms.pages.widget.games_list.age_group")}
        </Label>
        <Input
          id="gl-age"
          value={f.age_group ?? ""}
          disabled={disabled}
          onChange={(e) => setF({ age_group: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="gl-subject">
          {t("cms.pages.widget.games_list.subject")}
        </Label>
        <Input
          id="gl-subject"
          value={f.subject ?? ""}
          disabled={disabled}
          onChange={(e) => setF({ subject: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="gl-skill">
          {t("cms.pages.widget.games_list.skill")}
        </Label>
        <Input
          id="gl-skill"
          value={f.skill ?? ""}
          disabled={disabled}
          onChange={(e) => setF({ skill: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="gl-limit">
          {t("cms.pages.widget.games_list.limit")}
        </Label>
        <Input
          id="gl-limit"
          type="number"
          min={1}
          max={24}
          value={value.limit ?? 8}
          disabled={disabled}
          onChange={(e) => set({ limit: Number(e.target.value) || 8 })}
        />
      </div>
      <div>
        <Label htmlFor="gl-columns">
          {t("cms.pages.widget.games_list.columns")}
        </Label>
        <Input
          id="gl-columns"
          type="number"
          min={2}
          max={4}
          value={value.columns ?? 3}
          disabled={disabled}
          onChange={(e) => set({ columns: Number(e.target.value) || 3 })}
        />
      </div>
      <div>
        <Label htmlFor="gl-layout">
          {t("cms.pages.widget.games_list.layout")}
        </Label>
        <WidgetSelect
          inputId="gl-layout"
          ariaLabel={t("cms.pages.widget.games_list.layout")}
          disabled={disabled}
          value={value.layout ?? "grid"}
          onChange={(v) =>
            set({ layout: (v as "grid" | "carousel") || "grid" })
          }
          options={[
            {
              value: "grid",
              label: t("cms.pages.widget.games_list.layout_grid"),
            },
            {
              value: "carousel",
              label: t("cms.pages.widget.games_list.layout_carousel"),
            },
          ]}
        />
      </div>
    </div>
  );
}
