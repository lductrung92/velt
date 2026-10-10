import type { TFunction } from "i18next";
import { z } from "zod";

export interface TagFormValues {
  name: string;
  slug: string;
}

export const tagFormDefaults: TagFormValues = { name: "", slug: "" };

// Mirrors the backend tag constraints (name 1–80; slug optional, derived from
// name when blank). Messages are pre-translated so <FormMessage> renders them.
export function makeTagSchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(80, t("errors.validation.too_long")),
    slug: z.string().trim().max(80, t("errors.validation.too_long")),
  });
}
