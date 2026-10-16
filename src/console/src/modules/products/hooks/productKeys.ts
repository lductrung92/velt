// Per-module React Query key factory (mirrors cmsKeys / memberKeys).
export const productKeys = {
  all: ["products"] as const,
  categories: () => [...productKeys.all, "categories"] as const,
  // The same taxonomy read in the source language, for the editor's form. A
  // prefix of categories(), so every mutation's invalidation already covers it.
  list: (params: unknown) => [...productKeys.all, "list", params] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};
