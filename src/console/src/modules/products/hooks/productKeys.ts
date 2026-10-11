// Per-module React Query key factory (mirrors cmsKeys / memberKeys).
export const productKeys = {
  all: ["products"] as const,
  categories: () => [...productKeys.all, "categories"] as const,
  list: (params: unknown) => [...productKeys.all, "list", params] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};
