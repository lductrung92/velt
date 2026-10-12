import api from "@/services/api";

// Mirrors the Go backend (internal/modules/translation). Design:
// docs/domains/translation/README.md. Contract: docs/apis/translation-api.md.

/** One language's stored values for one record. */
export interface TranslationRecord {
  values: Record<string, unknown>;
  updated_at: string;
}

export interface TranslationView {
  entity: string;
  entity_id: string;
  /** The source language. It lives in the record's own columns, not here. */
  base_locale: string;
  /** Languages besides the source one, from translation.locales. */
  locales: string[];
  /**
   * Which fields may be translated. It comes from the server so the console
   * never keeps a second copy of that list — a write outside it is a 422.
   */
  translatable_fields: string[];
  /** Keyed by locale. A locale with nothing stored is simply absent. */
  translations: Record<string, TranslationRecord>;
  /**
   * True when a translation is newer than the published copy carrying it, i.e.
   * somebody translated and has not pressed Publish since.
   */
  requires_republish: boolean;
}

export const translationService = {
  get: (entity: string, id: string) =>
    api
      .get<TranslationView>(`/translations/${entity}/${id}`)
      .then((r) => r.data),

  /**
   * Replaces a whole language at once rather than patching fields: the form
   * sends every field, and a field left out means "drop the translation and use
   * the original again".
   */
  put: (
    entity: string,
    id: string,
    locale: string,
    values: Record<string, unknown>,
  ) =>
    api
      .put<TranslationView>(`/translations/${entity}/${id}/${locale}`, {
        values,
      })
      .then((r) => r.data),

  remove: (entity: string, id: string, locale: string) =>
    api.delete(`/translations/${entity}/${id}/${locale}`).then(() => undefined),
};
