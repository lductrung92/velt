import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProductCategories } from "@/modules/products/hooks/useProductCategories";

import { useCategories } from "../hooks/useCmsCategories";
import { flattenTree } from "../utils/categoryTree";

import { WidgetSelect } from "./WidgetSelect";

// Config editors for the v1 widgets. Each is a controlled value/onChange
// sub-form (the inline NodeView owns the draft via the node's `config` attr).

// An empty category is not a missing answer but a deliberate one: no filter, so
// the widget draws from the whole catalogue. The resolvers already read an
// absent category that way, which is why this option needs nothing new behind
// it.
const ALL_CATEGORIES = "";

// --- product_grid ---
// Only `category`, `sort` and `limit` reach the resolver; `title` is the heading
// the renderers draw above the rows. A field the resolver never reads would look
// like a filter that silently does nothing.
export interface ProductGridConfig {
  title?: string;
  category?: string;
  /** Matches catalog.PublicListParams.Sort — the backend defaults to featured. */
  sort?: "featured" | "newest" | "name" | "random";
  limit?: number;
  columns?: number;
}

export function ProductGridForm({
  value,
  onChange,
  disabled = false,
}: {
  value: ProductGridConfig;
  onChange: (v: ProductGridConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: categories } = useProductCategories();
  const set = (p: Partial<ProductGridConfig>) => onChange({ ...value, ...p });
  // Products are filtered by category SLUG (articles by id) — that is the
  // catalogue's own public key, not an oversight.
  const categoryOptions = [
    { value: ALL_CATEGORIES, label: t("cms.pages.widget.all_categories") },
    ...(categories?.items ?? []).map((c) => ({
      value: c.slug,
      label: c.name_display,
    })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="pg-title">
          {t("cms.pages.widget.product_grid.heading")}
        </Label>
        <Input
          id="pg-title"
          value={value.title ?? ""}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pg-category">
          {t("cms.pages.widget.product_grid.category")}
        </Label>
        <WidgetSelect
          inputId="pg-category"
          ariaLabel={t("cms.pages.widget.product_grid.category")}
          disabled={disabled}
          value={value.category ?? ALL_CATEGORIES}
          options={categoryOptions}
          onChange={(v) => set({ category: v })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pg-sort">
          {t("cms.pages.widget.product_grid.sort")}
        </Label>
        <WidgetSelect
          inputId="pg-sort"
          ariaLabel={t("cms.pages.widget.product_grid.sort")}
          disabled={disabled}
          value={value.sort ?? "featured"}
          options={(["featured", "newest", "name", "random"] as const).map(
            (s) => ({
              value: s,
              label: t(`cms.pages.widget.product_grid.sort_${s}`),
            }),
          )}
          onChange={(v) =>
            set({ sort: (v as ProductGridConfig["sort"]) || "featured" })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pg-limit">
          {t("cms.pages.widget.product_grid.limit")}
        </Label>
        <Input
          id="pg-limit"
          type="number"
          min={1}
          max={24}
          value={value.limit ?? 6}
          disabled={disabled}
          onChange={(e) => set({ limit: Number(e.target.value) || 6 })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pg-cols">
          {t("cms.pages.widget.product_grid.columns")}
        </Label>
        <Input
          id="pg-cols"
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

// --- articles_list ---
export interface ArticlesListConfig {
  title?: string;
  filters?: { category_id?: string };
  /** Matches the articles public service's sort — the backend defaults to newest. */
  sort?: "newest" | "oldest" | "title" | "random";
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
  const { data: tree } = useCategories();
  const f = value.filters ?? {};
  const set = (p: Partial<ArticlesListConfig>) => onChange({ ...value, ...p });
  const setF = (p: Partial<NonNullable<ArticlesListConfig["filters"]>>) =>
    onChange({ ...value, filters: { ...f, ...p } });
  // The taxonomy is a tree; non-breaking spaces carry the nesting, since the
  // option is rendered as plain text and a normal space would collapse.
  const categoryOptions = [
    { value: ALL_CATEGORIES, label: t("cms.pages.widget.all_categories") },
    ...flattenTree(tree ?? []).map((c) => ({
      value: c.id,
      label: "  ".repeat(c.depth) + c.name,
    })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
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
      <div className="space-y-2">
        <Label htmlFor="al-cat">
          {t("cms.pages.widget.articles_list.category_id")}
        </Label>
        <WidgetSelect
          inputId="al-cat"
          ariaLabel={t("cms.pages.widget.articles_list.category_id")}
          disabled={disabled}
          value={f.category_id ?? ALL_CATEGORIES}
          options={categoryOptions}
          onChange={(v) => setF({ category_id: v })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="al-sort">
          {t("cms.pages.widget.articles_list.sort")}
        </Label>
        <WidgetSelect
          inputId="al-sort"
          ariaLabel={t("cms.pages.widget.articles_list.sort")}
          disabled={disabled}
          value={value.sort ?? "newest"}
          options={(["newest", "oldest", "title", "random"] as const).map(
            (s) => ({
              value: s,
              label: t(`cms.pages.widget.articles_list.sort_${s}`),
            }),
          )}
          onChange={(v) =>
            set({ sort: (v as ArticlesListConfig["sort"]) || "newest" })
          }
        />
      </div>
      <div className="space-y-2">
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
      <div className="space-y-2">
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
      <div className="space-y-2 sm:col-span-2">
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
      <div className="space-y-2">
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
      <div className="space-y-2">
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
      <div className="space-y-2">
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
      <div className="space-y-2 sm:col-span-2">
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
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cb-sub">{t("cms.pages.widget.cta_banner.sub")}</Label>
        <Textarea
          id="cb-sub"
          rows={2}
          value={value.sub ?? ""}
          disabled={disabled}
          onChange={(e) => set({ sub: e.target.value })}
        />
      </div>
      <div className="space-y-2">
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
      <div className="space-y-2">
        <Label htmlFor="cb-href">
          {t("cms.pages.widget.cta_banner.button_href")}
        </Label>
        <Input
          id="cb-href"
          value={btn.href ?? ""}
          disabled={disabled}
          onChange={(e) => setBtn({ href: e.target.value })}
        />
      </div>
      <div className="space-y-2">
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
