// Per-module React Query key factory (console-react.md "Query keys").
export const cmsKeys = {
  all: ["cms"] as const,
  settings: () => [...cmsKeys.all, "settings"] as const,
  tags: () => [...cmsKeys.all, "tags"] as const,
  tagList: (params: unknown) => [...cmsKeys.tags(), "list", params] as const,
  tagOptions: () => [...cmsKeys.tags(), "options"] as const,
  categories: () => [...cmsKeys.all, "categories"] as const,
  articles: () => [...cmsKeys.all, "articles"] as const,
  articleList: (params: unknown) =>
    [...cmsKeys.articles(), "list", params] as const,
  articleDetail: (id: string) => [...cmsKeys.articles(), "detail", id] as const,
  pages: () => [...cmsKeys.all, "pages"] as const,
  pageList: () => [...cmsKeys.pages(), "list"] as const,
  pageDetail: (id: string) => [...cmsKeys.pages(), "detail", id] as const,
  landings: () => [...cmsKeys.all, "landings"] as const,
  landingList: () => [...cmsKeys.landings(), "list"] as const,
  landingDetail: (id: string) => [...cmsKeys.landings(), "detail", id] as const,
  menus: () => [...cmsKeys.all, "menus"] as const,
  menuList: () => [...cmsKeys.menus(), "list"] as const,
  menuDetail: (id: string) => [...cmsKeys.menus(), "detail", id] as const,
  // Target-picker option lists, keyed by entity + search term.
  menuTargets: (entity: string, q: string) =>
    [...cmsKeys.menus(), "targets", entity, q] as const,
  // Inline-widget editor preview, keyed by type + config (resolved live data).
  widgetPreview: (type: string, config: unknown) =>
    [...cmsKeys.all, "widgetPreview", type, config] as const,
};
