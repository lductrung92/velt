import api from "@/services/api";

import type { WidgetConfig } from "../components/widgetCatalog";

// Widget preview client. POST /cms/widgets/preview resolves an UNSAVED config to
// live data using the same backend resolver the public page uses — so the editor
// preview matches exactly what visitors will see. Item shapes mirror backend
// cms/widgets resolve.go.

export interface PreviewProductItem {
  slug: string;
  name: string;
  summary?: string | null;
  cover_url?: string | null;
  lifecycle: string;
  is_featured: boolean;
  audience: string[];
  platforms: string[];
  categories: string[];
}

export interface PreviewArticleItem {
  slug: string;
  title: string;
  excerpt?: string | null;
  published_at?: string | null;
}

export interface PreviewCategoryItem {
  slug: string;
  name: string;
  count: number;
}

export type PreviewItem =
  | PreviewProductItem
  | PreviewArticleItem
  | PreviewCategoryItem;

// data is {items} for the list widgets, or null for static widgets.
export interface WidgetPreviewResponse {
  type: string;
  data: { items: PreviewItem[] } | null;
}

export const previewWidget = async (
  type: string,
  config: WidgetConfig,
): Promise<WidgetPreviewResponse> => {
  const { data } = await api.post<WidgetPreviewResponse>(
    "/cms/widgets/preview",
    {
      type,
      config,
    },
  );
  return data;
};
