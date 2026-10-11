import type { Product, SiteContent } from "../types";
import { examples } from "../data/examples";

export interface Filters {
  query: string;
  category: string;
  status: string;
  sort: string;
  page: number;
}
export const categoryOf = (product: Product) =>
  product.category?.trim() || "Khác";
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
export function getCatalog(data: SiteContent) {
  const isExample = !data.products.length && data.showProductExamples;
  return { products: isExample ? examples : data.products, isExample };
}
export function selectProducts(
  products: Product[],
  filters: Partial<Filters> = {},
) {
  const words = normalizeSearch(filters.query || "")
    .split(/\s+/)
    .filter(Boolean);
  return products
    .filter((product) => {
      const haystack = normalizeSearch(
        [
          product.name,
          product.summary,
          categoryOf(product),
          product.audience,
          ...(product.skills || []),
        ].join(" "),
      );
      return (
        (!filters.category || categoryOf(product) === filters.category) &&
        (!filters.status || product.status === filters.status) &&
        words.every((word) => haystack.includes(word))
      );
    })
    .sort((a, b) =>
      filters.sort === "name"
        ? a.name.localeCompare(b.name, "vi")
        : filters.sort === "newest"
          ? (Date.parse(b.createdAt || "") || 0) -
            (Date.parse(a.createdAt || "") || 0)
          : Number(!!b.featured) - Number(!!a.featured),
    );
}
export function readFilters(url: URL, products: Product[]): Filters {
  const params = url.searchParams;
  const category = params.get("category") || "",
    status = params.get("status") || "";
  const page = Number(params.get("page"));
  return {
    query: (params.get("q") || "").slice(0, 200),
    category: products.some((product) => categoryOf(product) === category)
      ? category
      : "",
    status: products.some((product) => product.status === status) ? status : "",
    sort: ["featured", "newest", "name"].includes(params.get("sort") || "")
      ? params.get("sort")!
      : "featured",
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
  };
}
export const productPath = (product: Product) =>
  `/products/${encodeURIComponent(product.id)}`;
