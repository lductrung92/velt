import { type ReactNode } from "react";

import { GamesListForm, type GamesListConfig } from "./GamesListForm";
import {
  ArticlesListForm,
  CategoriesShowcaseForm,
  CtaBannerForm,
  RichTextForm,
  type ArticlesListConfig,
  type CategoriesShowcaseConfig,
  type CtaBannerConfig,
  type RichTextConfig,
} from "./widgetForms";

export type WidgetConfig = Record<string, unknown>;

// All v1 widget types (shared by the block-list builder and the inline editor).
export const WIDGET_TYPES = [
  "games_list",
  "articles_list",
  "categories_showcase",
  "rich_text",
  "cta_banner",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export function isKnownWidget(type: string): type is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(type);
}

// defaultConfig is the starting config when a widget is first inserted.
export function defaultConfig(type: string): WidgetConfig {
  switch (type) {
    case "games_list":
      return { limit: 8, columns: 3, layout: "grid" };
    case "articles_list":
      return { limit: 6, columns: 3 };
    case "categories_showcase":
      return { limit: 12 };
    case "rich_text":
      return { width: "normal" };
    case "cta_banner":
      return { align: "center" };
    default:
      return {};
  }
}

// renderWidgetForm renders the per-type config editor (shared sub-forms).
export function renderWidgetForm(
  type: string,
  value: WidgetConfig,
  onChange: (v: WidgetConfig) => void,
  disabled: boolean,
): ReactNode {
  const ch = (v: unknown) => onChange(v as WidgetConfig);
  switch (type) {
    case "games_list":
      return (
        <GamesListForm
          value={value as GamesListConfig}
          onChange={ch}
          disabled={disabled}
        />
      );
    case "articles_list":
      return (
        <ArticlesListForm
          value={value as ArticlesListConfig}
          onChange={ch}
          disabled={disabled}
        />
      );
    case "categories_showcase":
      return (
        <CategoriesShowcaseForm
          value={value as CategoriesShowcaseConfig}
          onChange={ch}
          disabled={disabled}
        />
      );
    case "rich_text":
      return (
        <RichTextForm
          value={value as RichTextConfig}
          onChange={ch}
          disabled={disabled}
        />
      );
    case "cta_banner":
      return (
        <CtaBannerForm
          value={value as CtaBannerConfig}
          onChange={ch}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}
