import type { TFunction } from "i18next";
import { z } from "zod";

import type { MenuLinkType } from "../services/menus.service";

// --- Menu slot (CreateMenuDialog → POST/PATCH /cms/menus) ---

export interface MenuSlotFormValues {
  name: string;
  location: string;
}

export const menuSlotDefaults: MenuSlotFormValues = { name: "", location: "" };

// ascii slug for `location` (no spaces / odd chars) — UNIQUE is enforced by the
// backend (409). Mirrors backend limits (name ≤200, location ≤100).
const LOCATION_RE = /^[a-zA-Z0-9_-]+$/;

export function makeMenuSlotSchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(200, t("errors.validation.too_long")),
    location: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(100, t("errors.validation.too_long"))
      .regex(LOCATION_RE, t("errors.validation.invalid_value")),
  });
}

// --- Menu item (ItemFormDialog → applied to the local draft tree) ---

export interface MenuItemFormValues {
  label: string;
  // One line under the label on the site; empty = label only.
  description: string;
  link_type: MenuLinkType;
  // Used for internal/external; empty otherwise.
  url: string;
  // Used for article/page/category; null otherwise.
  target_id: string | null;
  open_new_tab: boolean;
}

export const menuItemDefaults: MenuItemFormValues = {
  label: "",
  description: "",
  link_type: "internal",
  url: "",
  target_id: null,
  open_new_tab: false,
};

export function isEntityLink(linkType: MenuLinkType): boolean {
  return (
    linkType === "article" || linkType === "page" || linkType === "category"
  );
}

// Client-side UX validation; the backend service layer is the source of truth
// (external scheme/host reject, target existence/published, cycle).
export function makeMenuItemSchema(t: TFunction) {
  return z
    .object({
      label: z
        .string()
        .trim()
        .min(1, t("errors.validation.required"))
        .max(200, t("errors.validation.too_long")),
      description: z
        .string()
        .trim()
        .max(300, t("errors.validation.too_long")),
      link_type: z.enum([
        "internal",
        "external",
        "article",
        "page",
        "category",
      ]),
      url: z.string().trim().max(2000, t("errors.validation.too_long")),
      target_id: z.string().nullable(),
      open_new_tab: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (isEntityLink(v.link_type)) {
        if (!v.target_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["target_id"],
            message: t("errors.validation.required"),
          });
        }
        return;
      }
      // internal / external → url required.
      if (!v.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: t("errors.validation.required"),
        });
        return;
      }
      if (v.link_type === "internal" && !v.url.startsWith("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: t("errors.validation.invalid_url"),
        });
      }
      if (v.link_type === "external" && !/^https?:\/\//i.test(v.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: t("errors.validation.invalid_url"),
        });
      }
    });
}
