import type { TFunction } from "i18next";
import { z } from "zod";

import type { ArticleStatus } from "../services/articles.service";

// The article editor form. body_json (the Tiptap doc) is held in component state,
// not the form — only body_html is validated here. Messages are pre-translated.
export interface ArticleFormValues {
  title: string;
  slug: string;
  excerpt: string;
  body_html: string;
  category_id: string;
  status: ArticleStatus;
  publish_at: string;
  note: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  canonical_url: string;
  seo_noindex: boolean;
  seo_nofollow: boolean;
  og_title: string;
  og_description: string;
}

export const articleFormDefaults: ArticleFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  body_html: "",
  category_id: "",
  status: "draft",
  publish_at: "",
  note: "",
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
  canonical_url: "",
  seo_noindex: false,
  seo_nofollow: false,
  og_title: "",
  og_description: "",
};

// Reject markup that has no visible text (an "empty" Tiptap doc still serializes
// to "<p></p>").
function htmlHasText(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim().length > 0
  );
}

// Mirrors the backend article constraints (models.go) + the conditional inputs
// the status matrix needs: category required when the categorize flag is ON;
// publish_at required for `scheduled`; note required for `needs_revision`.
export function makeArticleSchema(
  t: TFunction,
  opts: { categorizeRequired: boolean },
) {
  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, t("errors.validation.required"))
        .max(300, t("errors.validation.too_long")),
      slug: z.string().trim().max(300, t("errors.validation.too_long")),
      excerpt: z.string().trim().max(500, t("errors.validation.too_long")),
      body_html: z
        .string()
        .refine(htmlHasText, { message: t("errors.validation.required") }),
      category_id: z.string(),
      status: z.string(),
      publish_at: z.string(),
      note: z.string().trim().max(1000, t("errors.validation.too_long")),
      seo_title: z.string().trim().max(255, t("errors.validation.too_long")),
      seo_description: z
        .string()
        .trim()
        .max(500, t("errors.validation.too_long")),
      seo_keywords: z.string().trim().max(255, t("errors.validation.too_long")),
      canonical_url: z
        .string()
        .trim()
        .max(500, t("errors.validation.too_long"))
        .refine((v) => v === "" || /^https?:\/\//i.test(v), {
          message: t("errors.validation.invalid_url"),
        }),
      seo_noindex: z.boolean(),
      seo_nofollow: z.boolean(),
      og_title: z.string().trim().max(255, t("errors.validation.too_long")),
      og_description: z
        .string()
        .trim()
        .max(500, t("errors.validation.too_long")),
    })
    .superRefine((val, ctx) => {
      if (opts.categorizeRequired && !val.category_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["category_id"],
          message: t("errors.validation.required"),
        });
      }
      const status = val.status as ArticleStatus;
      if (status === "scheduled") {
        const future = val.publish_at && new Date(val.publish_at) > new Date();
        if (!future) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["publish_at"],
            message: t("errors.validation.required"),
          });
        }
      }
      if (status === "needs_revision" && !val.note.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["note"],
          message: t("errors.validation.required"),
        });
      }
    });
}
