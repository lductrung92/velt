import type { TFunction } from "i18next";
import { z } from "zod";

// Schema factories take `t` so zod messages are already-translated strings
// (rendered as-is by <FormMessage>). Field reasons mirror errors.validation.*.

// Step 1 — credentials. Login does NOT enforce password min-length (it's
// compared to a hash); the 12-char policy only applies at reset.
export function makeLoginSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .min(1, t("errors.validation.required"))
      .email(t("errors.validation.invalid_email")),
    password: z.string().min(1, t("errors.validation.required")),
  });
}

// Step 2 (2FA) is a single field (`code` = 6-digit TOTP OR a recovery code) —
// handled with plain local state in the Login page, so no schema here.

// Reset password: client mirrors the policy (min 12) as a hint; the server is
// the authority (also rejects too-common). confirm_password is client-only
// (never sent). docs/screens/auth-reset-password/validation-rules.md.
export function makeResetSchema(t: TFunction) {
  return z
    .object({
      new_password: z.string().min(12, t("errors.validation.too_short")),
      confirm_password: z.string().min(1, t("errors.validation.required")),
    })
    .refine((v) => v.new_password === v.confirm_password, {
      path: ["confirm_password"],
      message: t("errors.validation.password_mismatch"),
    });
}

// Forgot password: a single email field.
export function makeForgotSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .min(1, t("errors.validation.required"))
      .email(t("errors.validation.invalid_email")),
  });
}

export type LoginValues = z.infer<ReturnType<typeof makeLoginSchema>>;
export type ResetValues = z.infer<ReturnType<typeof makeResetSchema>>;
export type ForgotValues = z.infer<ReturnType<typeof makeForgotSchema>>;
