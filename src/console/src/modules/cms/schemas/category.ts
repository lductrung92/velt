import type { TFunction } from "i18next";
import { z } from "zod";

import type { CategoryStatus } from "../services/categories.service";

// The "full" category dialog (consolidated create/edit): identity + placement +
// long description + SEO. Slug is optional (derived from name when blank);
// parent_id "" means a root node. Messages are pre-translated so <FormMessage>
// renders them directly.
export interface CategoryFormValues {
  name: string;
  slug: string;
  status: CategoryStatus;
  parent_id: string;
  sort_order: number;
  description: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

export const categoryFormDefaults: CategoryFormValues = {
  name: "",
  slug: "",
  // A new category is in use the moment it exists; the column defaults the
  // same way, so the form and the server agree without sending anything.
  status: "published",
  parent_id: "",
  sort_order: 0,
  description: "",
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
};

// Mirrors the backend category constraints (models.go): name 1–160; slug ≤160;
// description ≤2000; SEO title/keywords ≤255, description ≤500; sort_order ≥0.
export function makeCategorySchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(160, t("errors.validation.too_long")),
    slug: z.string().trim().max(160, t("errors.validation.too_long")),
    status: z.enum(["draft", "published", "archived"]),
    parent_id: z.string(),
    sort_order: z.coerce
      .number({ invalid_type_error: t("errors.validation.invalid_value") })
      .int(t("errors.validation.invalid_value"))
      .min(0, t("errors.validation.out_of_range")),
    description: z.string().trim().max(2000, t("errors.validation.too_long")),
    seo_title: z.string().trim().max(255, t("errors.validation.too_long")),
    seo_description: z
      .string()
      .trim()
      .max(500, t("errors.validation.too_long")),
    seo_keywords: z.string().trim().max(255, t("errors.validation.too_long")),
  });
}
