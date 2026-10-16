import api from "@/services/api";

// Mirrors the Go backend exactly (contract-first, docs/apis/products-api.md §3 +
// backend/internal/modules/products/categories).
//
// Per-category SEO meta for the public category landing. Same shape as the CMS
// taxonomy's so both screens stay interchangeable.
export interface ProductCategorySEO {
  title: string | null;
  description: string | null;
  keywords: string | null;
}

/**
 * A category's state. Three, not the editorial workflow's six: a category is
 * never submitted for review and never scheduled. Same vocabulary as the CMS
 * taxonomy's, so both screens stay interchangeable.
 */
export type ProductCategoryStatus = "draft" | "published" | "archived";

export const PRODUCT_CATEGORY_STATUSES: ProductCategoryStatus[] = [
  "published",
  "draft",
  "archived",
];

export interface ProductCategory {
  id: string;
  slug: string;
  /**
   * The stored name, in the source language. This is what the editor writes
   * back, so a screen that SHOWS a category wants name_display instead —
   * rendering this one would be harmless, rendering name_display into a form
   * would not.
   */
  name: string;
  /** The name in the language the request asked for; falls back to `name`. */
  name_display: string;
  description: string | null;
  sort_order: number;
  status: ProductCategoryStatus;
  /** How many products sit in this category. The delete dialog shows it,
   *  since deleting unlinks those products rather than removing them. */
  product_count: number;
  seo: ProductCategorySEO;
  created_at: string;
  updated_at: string;
}

// The taxonomy is small and curated, so the list is never paginated.
export interface ProductCategoryListResult {
  items: ProductCategory[];
}

export interface CreateProductCategoryBody {
  name: string;
  slug?: string;
  description?: string;
  /** Omitted on create means published — a new category is in use. */
  status?: ProductCategoryStatus;
  sort_order?: number;
  // Omit to leave meta untouched; send it to replace all three fields at once.
  seo?: { title?: string; description?: string; keywords?: string };
}

// PATCH semantics: an omitted key keeps the current value, an empty string
// clears the field.
export type UpdateProductCategoryBody = Partial<CreateProductCategoryBody>;

export const productCategoriesService = {
  async list(): Promise<ProductCategoryListResult> {
    const { data } = await api.get<ProductCategoryListResult>(
      "/product-categories",
    );
    return data;
  },

  // The same taxonomy, forced to the source language. The editor hydrates its
  // form from this list rather than from a per-id read, and the list the
  // screens show is translated into whatever the console is read in: seeding
  // the form with that would write English into the Vietnamese row on save.
  async create(body: CreateProductCategoryBody): Promise<ProductCategory> {
    const { data } = await api.post<ProductCategory>(
      "/product-categories",
      body,
    );
    return data;
  },

  async update(
    id: string,
    body: UpdateProductCategoryBody,
  ): Promise<ProductCategory> {
    const { data } = await api.patch<ProductCategory>(
      `/product-categories/${id}`,
      body,
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/product-categories/${id}`);
  },

  // Full id list in the desired display order; the server rewrites sort_order.
  async reorder(ids: string[]): Promise<void> {
    await api.put("/product-categories/order", { ids });
  },
};
