import type { TFunction } from "i18next";

import { ApiError } from "@/types/errors";

export interface ParsedApiError {
  /** Translated top-level message (renderable). */
  message: string;
  /** Per-field translated messages keyed by field name (for inline display). */
  fieldErrors: Record<string, string>;
  /** Raw snake_case key (for branching, e.g. `invalid_credentials`). */
  key: string;
  code: number;
}

// Normalize any caught error into a translated, render-safe shape.
// Never render `error.message` raw — it's a key. Field keys map via
// `errors.validation.<key>` (docs/ai/i18n.md).
export function parseApiError(err: unknown, t: TFunction): ParsedApiError {
  if (err instanceof ApiError) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, key] of Object.entries(err.fields)) {
      // defaultValue so an unmapped field key never renders as a raw snake_case
      // string (docs/ai/i18n.md).
      fieldErrors[field] = t(`errors.validation.${key}`, {
        defaultValue: t("errors.unknown"),
      });
    }
    return {
      message: t(`errors.${err.message}`, {
        defaultValue: t("errors.unknown"),
      }),
      fieldErrors,
      key: err.message,
      code: err.code,
    };
  }
  return {
    message: t("errors.unknown"),
    fieldErrors: {},
    key: "unknown",
    code: 500,
  };
}
