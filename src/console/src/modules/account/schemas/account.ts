import type { TFunction } from "i18next";
import { z } from "zod";

// Schema factories take `t` so zod messages are already-translated strings
// (rendered as-is by <FormMessage>). Mirror the BE field-for-field.

// Profile: full_name 1–120, trimmed, no whitespace-only.
export function makeProfileSchema(t: TFunction) {
  return z.object({
    full_name: z
      .string()
      .trim()
      .min(1, t("errors.validation.required"))
      .max(120, t("errors.validation.too_long")),
  });
}

// Change password: current required; new min 12 (hint — server is authority);
// confirm client-only, must match. confirm is NEVER sent to the BE.
export function makeChangePasswordSchema(t: TFunction) {
  return z
    .object({
      current_password: z.string().min(1, t("errors.validation.required")),
      new_password: z.string().min(12, t("errors.validation.too_short")),
      confirm_password: z.string().min(1, t("errors.validation.required")),
    })
    .refine((v) => v.new_password === v.confirm_password, {
      path: ["confirm_password"],
      message: t("errors.validation.password_mismatch"),
    });
}

// 2FA enable: TOTP code is exactly 6 digits (stricter than login step 2, which
// also accepts a recovery code).
export function makeEnable2faSchema(t: TFunction) {
  return z.object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, t("errors.validation.invalid_code")),
  });
}

// Re-auth (disable / regenerate): password non-empty only — the BE verifies the
// hash. No min-12 here (that's the policy for SETTING a new password).
export function makeReauthSchema(t: TFunction) {
  return z.object({
    password: z.string().min(1, t("errors.validation.required")),
  });
}

export type ProfileValues = z.infer<ReturnType<typeof makeProfileSchema>>;
export type ChangePasswordValues = z.infer<
  ReturnType<typeof makeChangePasswordSchema>
>;
export type Enable2faValues = z.infer<ReturnType<typeof makeEnable2faSchema>>;
export type ReauthValues = z.infer<ReturnType<typeof makeReauthSchema>>;
