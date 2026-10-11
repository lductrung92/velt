// Per-module React Query key factory (mirrors cmsKeys).
export const memberKeys = {
  all: ["members"] as const,
  list: (params: unknown) => [...memberKeys.all, "list", params] as const,
  detail: (id: string) => [...memberKeys.all, "detail", id] as const,
};
