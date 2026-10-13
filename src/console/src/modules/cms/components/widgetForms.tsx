import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { WidgetSelect } from "./WidgetSelect";

// Config editors for the remaining v1 widgets. Each is a controlled value/onChange
// sub-form (the inline NodeView owns the draft via the node's `config` attr).
// Text-only v1 — keep inputs simple; richer pickers (category select, multi-button)
// are a later polish.

// --- articles_list ---
export interface ArticlesListConfig {
  title?: string;
  filters?: { category_id?: string; tag?: string };
  limit?: number;
  columns?: number;
}

export function ArticlesListForm({
  value,
  onChange,
  disabled = false,
}: {
  value: ArticlesListConfig;
  onChange: (v: ArticlesListConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const f = value.filters ?? {};
  const set = (p: Partial<ArticlesListConfig>) => onChange({ ...value, ...p });
  const setF = (p: Partial<NonNullable<ArticlesListConfig["filters"]>>) =>
    onChange({ ...value, filters: { ...f, ...p } });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="al-title">
          {t("cms.pages.widget.articles_list.heading")}
        </Label>
        <Input
          id="al-title"
          value={value.title ?? ""}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="al-cat">
          {t("cms.pages.widget.articles_list.category_id")}
        </Label>
        <Input
          id="al-cat"
          value={f.category_id ?? ""}
          disabled={disabled}
          onChange={(e) => setF({ category_id: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="al-tag">
          {t("cms.pages.widget.articles_list.tag")}
        </Label>
        <Input
          id="al-tag"
          value={f.tag ?? ""}
          disabled={disabled}
          onChange={(e) => setF({ tag: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="al-limit">
          {t("cms.pages.widget.articles_list.limit")}
        </Label>
        <Input
          id="al-limit"
          type="number"
          min={1}
          max={24}
          value={value.limit ?? 6}
          disabled={disabled}
          onChange={(e) => set({ limit: Number(e.target.value) || 6 })}
        />
      </div>
      <div>
        <Label htmlFor="al-cols">
          {t("cms.pages.widget.articles_list.columns")}
        </Label>
        <Input
          id="al-cols"
          type="number"
          min={2}
          max={4}
          value={value.columns ?? 3}
          disabled={disabled}
          onChange={(e) => set({ columns: Number(e.target.value) || 3 })}
        />
      </div>
    </div>
  );
}

// --- categories_showcase ---
export interface CategoriesShowcaseConfig {
  title?: string;
  limit?: number;
}

export function CategoriesShowcaseForm({
  value,
  onChange,
  disabled = false,
}: {
  value: CategoriesShowcaseConfig;
  onChange: (v: CategoriesShowcaseConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const set = (p: Partial<CategoriesShowcaseConfig>) =>
    onChange({ ...value, ...p });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="cs-title">
          {t("cms.pages.widget.categories_showcase.heading")}
        </Label>
        <Input
          id="cs-title"
          value={value.title ?? ""}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="cs-limit">
          {t("cms.pages.widget.categories_showcase.limit")}
        </Label>
        <Input
          id="cs-limit"
          type="number"
          min={1}
          max={50}
          value={value.limit ?? 12}
          disabled={disabled}
          onChange={(e) => set({ limit: Number(e.target.value) || 12 })}
        />
      </div>
    </div>
  );
}

// --- rich_text ---
export interface RichTextConfig {
  html?: string;
  width?: "narrow" | "normal" | "wide";
}

export function RichTextForm({
  value,
  onChange,
  disabled = false,
}: {
  value: RichTextConfig;
  onChange: (v: RichTextConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const set = (p: Partial<RichTextConfig>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="rt-html">{t("cms.pages.widget.rich_text.html")}</Label>
        <Textarea
          id="rt-html"
          rows={5}
          value={value.html ?? ""}
          disabled={disabled}
          onChange={(e) => set({ html: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("cms.pages.widget.rich_text.html_hint")}
        </p>
      </div>
      <div>
        <Label htmlFor="rt-width">
          {t("cms.pages.widget.rich_text.width")}
        </Label>
        <WidgetSelect
          inputId="rt-width"
          ariaLabel={t("cms.pages.widget.rich_text.width")}
          disabled={disabled}
          value={value.width ?? "normal"}
          onChange={(v) =>
            set({ width: (v as RichTextConfig["width"]) || "normal" })
          }
          options={[
            {
              value: "narrow",
              label: t("cms.pages.widget.rich_text.width_narrow"),
            },
            {
              value: "normal",
              label: t("cms.pages.widget.rich_text.width_normal"),
            },
            {
              value: "wide",
              label: t("cms.pages.widget.rich_text.width_wide"),
            },
          ]}
        />
      </div>
    </div>
  );
}

// --- cta_banner ---
export interface CtaBannerConfig {
  heading?: string;
  sub?: string;
  buttons?: { label?: string; href?: string; style?: string }[];
  align?: "left" | "center";
}

export function CtaBannerForm({
  value,
  onChange,
  disabled = false,
}: {
  value: CtaBannerConfig;
  onChange: (v: CtaBannerConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const btn = value.buttons?.[0] ?? {};
  const set = (p: Partial<CtaBannerConfig>) => onChange({ ...value, ...p });
  const setBtn = (
    p: Partial<NonNullable<CtaBannerConfig["buttons"]>[number]>,
  ) => onChange({ ...value, buttons: [{ ...btn, ...p, style: "primary" }] });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="cb-heading">
          {t("cms.pages.widget.cta_banner.heading")}
        </Label>
        <Input
          id="cb-heading"
          value={value.heading ?? ""}
          disabled={disabled}
          onChange={(e) => set({ heading: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="cb-sub">{t("cms.pages.widget.cta_banner.sub")}</Label>
        <Textarea
          id="cb-sub"
          rows={2}
          value={value.sub ?? ""}
          disabled={disabled}
          onChange={(e) => set({ sub: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="cb-label">
          {t("cms.pages.widget.cta_banner.button_label")}
        </Label>
        <Input
          id="cb-label"
          value={btn.label ?? ""}
          disabled={disabled}
          onChange={(e) => setBtn({ label: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="cb-href">
          {t("cms.pages.widget.cta_banner.button_href")}
        </Label>
        <Input
          id="cb-href"
          value={btn.href ?? ""}
          disabled={disabled}
          onChange={(e) => setBtn({ href: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("cms.pages.widget.cta_banner.button_hint")}
        </p>
      </div>
      <div>
        <Label htmlFor="cb-align">
          {t("cms.pages.widget.cta_banner.align")}
        </Label>
        <WidgetSelect
          inputId="cb-align"
          ariaLabel={t("cms.pages.widget.cta_banner.align")}
          disabled={disabled}
          value={value.align ?? "center"}
          onChange={(v) =>
            set({ align: (v as CtaBannerConfig["align"]) || "center" })
          }
          options={[
            {
              value: "left",
              label: t("cms.pages.widget.cta_banner.align_left"),
            },
            {
              value: "center",
              label: t("cms.pages.widget.cta_banner.align_center"),
            },
          ]}
        />
      </div>
    </div>
  );
}
