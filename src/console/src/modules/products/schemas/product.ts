import type { TFunction } from "i18next";
import { z } from "zod";

import type { ProductLifecycle } from "../services/products.service";

export interface ProductFormValues {
  name: string;
  slug: string;
  summary: string;
  body_html: string;
  lifecycle: ProductLifecycle;
  version: string;
  released_at: string;
  audience: string[];
  platforms: string[];
  tech_stack: string[];
  highlights: string[];
  is_featured: boolean;
  sort_order: number;
  product_url: string;
  demo_url: string;
  demo_access: string;
  demo_instructions: string[];
}

export const productFormDefaults: ProductFormValues = {
  name: "",
  slug: "",
  summary: "",
  body_html: "",
  lifecycle: "idea",
  version: "",
  released_at: "",
  audience: [],
  platforms: [],
  tech_stack: [],
  highlights: [],
  is_featured: false,
  sort_order: 0,
  product_url: "",
  demo_url: "",
  demo_access: "",
  demo_instructions: [],
};

// Only http(s) reaches an <a href> on the public site. The backend enforces the
// same allowlist — this is the client-side mirror so the author sees the problem
// before submitting, not a substitute for it.
function httpUrl(t: TFunction) {
  return z
    .string()
    .trim()
    .refine(
      (v) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v),
      t("errors.validation.invalid_url"),
    );
}

// Mirrors the Go CreateRequest/UpdateRequest constraints.
export function makeProductSchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(200, t("errors.validation.too_long")),
    slug: z.string().trim().max(200, t("errors.validation.too_long")),
    summary: z.string().trim().max(500, t("errors.validation.too_long")),
    body_html: z.string(),
    lifecycle: z.enum(["idea", "building", "launched"]),
    version: z.string().trim().max(40, t("errors.validation.too_long")),
    // A calendar date, or empty to clear it.
    released_at: z
      .union([
        z.literal(""),
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, t("errors.validation.invalid_value")),
      ]),
    audience: z.array(z.string()).max(20),
    platforms: z.array(z.string()).max(20),
    tech_stack: z.array(z.string().max(60)).max(50),
    highlights: z.array(z.string().max(300)).max(20),
    is_featured: z.boolean(),
    sort_order: z
      .number()
      .int()
      .min(0, t("errors.validation.out_of_range"))
      .max(100000, t("errors.validation.out_of_range")),
    product_url: z.union([z.literal(""), httpUrl(t)]),
    demo_url: z.union([z.literal(""), httpUrl(t)]),
    demo_access: z.string().trim().max(300, t("errors.validation.too_long")),
    demo_instructions: z.array(z.string().max(300)).max(20),
  });
}
