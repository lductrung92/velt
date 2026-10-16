import type { TFunction } from "i18next";
import { z } from "zod";

export interface MemberLinkValues {
  label: string;
  url: string;
}

export interface MemberFormValues {
  full_name: string;
  display_name: string;
  slug: string;
  role: string;
  bio: string;
  email: string;
  zalo: string;
  skills: string[];
  links: MemberLinkValues[];
  is_active: boolean;
}

export const memberFormDefaults: MemberFormValues = {
  full_name: "",
  display_name: "",
  slug: "",
  role: "",
  bio: "",
  email: "",
  zalo: "",
  skills: [],
  links: [],
  is_active: true,
};

// Only http(s) reaches an <a href> on the public site. The backend enforces the
// same allowlist (members.isHTTPURL) — this is the client-side mirror so the
// user sees the problem before submitting, not a substitute for it.
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
export function makeMemberSchema(t: TFunction) {
  return z.object({
    full_name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(160, t("errors.validation.too_long")),
    // Optional: left empty, the site falls back to full_name.
    display_name: z.string().trim().max(160, t("errors.validation.too_long")),
    slug: z.string().trim().max(160, t("errors.validation.too_long")),
    role: z.string().trim().max(160, t("errors.validation.too_long")),
    bio: z.string().trim().max(4000, t("errors.validation.too_long")),
    email: z
      .union([
        z.literal(""),
        z.string().trim().email(t("errors.validation.invalid_email")),
      ])
      .refine((v) => v.length <= 255, t("errors.validation.too_long")),
    zalo: z.union([z.literal(""), httpUrl(t)]),
    skills: z.array(z.string().trim().max(60)).max(50),
    links: z
      .array(
        z.object({
          label: z
            .string()
            .trim()
            .min(1, t("errors.validation.required"))
            .max(60, t("errors.validation.too_long")),
          url: httpUrl(t).refine(
            (v) => v.length <= 500,
            t("errors.validation.too_long"),
          ),
        }),
      )
      .max(20),
    is_active: z.boolean(),
  });
}
