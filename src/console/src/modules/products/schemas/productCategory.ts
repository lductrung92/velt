import type { TFunction } from "i18next";
import { z } from "zod";

export interface ProductCategoryFormValues {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

export const productCategoryFormDefaults: ProductCategoryFormValues = {
  name: "",
  slug: "",
  description: "",
  sort_order: 0,
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
};

// Mirrors the Go CreateRequest/UpdateRequest constraints, including the SEO
// sub-object's own limits.
export function makeProductCategorySchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(160, t("errors.validation.too_long")),
    slug: z.string().trim().max(160, t("errors.validation.too_long")),
    description: z.string().trim().max(1000, t("errors.validation.too_long")),
    sort_order: z
      .number()
      .int()
      .min(0, t("errors.validation.out_of_range"))
      .max(100000, t("errors.validation.out_of_range")),
    seo_title: z.string().trim().max(255, t("errors.validation.too_long")),
    seo_description: z.string().trim().max(500, t("errors.validation.too_long")),
    seo_keywords: z.string().trim().max(255, t("errors.validation.too_long")),
  });
}
