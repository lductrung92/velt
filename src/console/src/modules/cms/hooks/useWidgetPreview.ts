import { useQuery } from "@tanstack/react-query";

import type { WidgetConfig } from "../components/widgetCatalog";
import { previewWidget } from "../services/widgets.service";

import { cmsKeys } from "./cmsKeys";

// Resolves a widget config to live data for the editor's preview tab. Only the
// three data-backed list widgets call this; static widgets render from config.
export function useWidgetPreview(type: string, config: WidgetConfig) {
  return useQuery({
    queryKey: cmsKeys.widgetPreview(type, config),
    queryFn: () => previewWidget(type, config),
    staleTime: 30_000,
  });
}
