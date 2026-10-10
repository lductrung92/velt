import type { TFunction } from "i18next";
import { z } from "zod";

// Schema factories take `t` so zod messages are already-translated. Mirror the
// BE field-for-field; the BE re-validates (incl. uniqueness + RBAC) regardless.

export function makeCreateUserSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .min(1, t("errors.validation.required"))
      .email(t("errors.validation.invalid_email")),
    full_name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(120, t("errors.validation.too_long")),
    // Single role on console; only rendered/sent for super_admin (else editor).
    role_id: z.string().optional(),
  });
}

export function makeEditUserSchema(t: TFunction) {
  return z.object({
    full_name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(120, t("errors.validation.too_long")),
    // Admins can only set active/disabled; `locked` is system-managed.
    status: z.enum(["active", "disabled"]),
    // Role change is super_admin only; only rendered/sent for super_admin.
    role_id: z.string().optional(),
  });
}

export type CreateUserValues = z.infer<ReturnType<typeof makeCreateUserSchema>>;
export type EditUserValues = z.infer<ReturnType<typeof makeEditUserSchema>>;
