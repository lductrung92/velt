import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { useAppConfig } from "@/app/useAppConfig";

import {
  translationService,
  type TranslationView,
} from "../services/translation.service";

// Rich text arrives as HTML, so "empty" is not "". An editor that has only ever
// been focused still reports "<p></p>", and treating that as a translation would
// both inflate the progress count and overwrite a real value with nothing.
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") return textOf(value) === "" ? "" : value;
  return value;
}

function filled(value: unknown): boolean {
  if (typeof value === "string") return textOf(value) !== "";
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return (
      (typeof a === "string" ? a : "") === (typeof b === "string" ? b : "")
    );
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const translationKeys = {
  one: (entity: string, id: string) => ["translations", entity, id] as const,
};

/** How much of one language is filled in, for the tab's progress chip. */
export interface LocaleProgress {
  done: number;
  total: number;
}

export interface EntityTranslation {
  /** False when translation.enabled is off — callers render nothing. */
  enabled: boolean;
  /** The source language ("vi"); its values live in the record's own form. */
  baseLocale: string;
  /** Source language first, then the configured ones. */
  tabs: string[];
  locale: string;
  setLocale: (locale: string) => void;
  isBase: boolean;
  fields: string[];
  /** Draft values of the active language, edited in place. */
  values: Record<string, unknown>;
  setField: (field: string, value: unknown) => void;
  dirty: boolean;
  progress: (locale: string) => LocaleProgress;
  requiresRepublish: boolean;
  /** Persists every edited language. Safe to call when nothing changed. */
  flush: (entityId: string) => Promise<void>;
  /**
   * Re-reads the server's view. Call it after the record itself has been saved:
   * publishing is what clears "needs republishing", and that happens after the
   * translations are stored, so the copy fetched during flush is already stale.
   */
  refresh: () => Promise<void>;
}

/**
 * Everything an editor screen needs to offer translations, in one hook.
 *
 * Draft values are kept outside the record's own react-hook-form on purpose:
 * their shape is dynamic (locale x declared field), which a static zod schema
 * cannot describe. This is the same split the SEO/image state already uses.
 */
export function useEntityTranslation(
  entity: string,
  entityId: string | undefined,
): EntityTranslation {
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const enabled = config?.translationEnabled === true;

  const query = useQuery({
    queryKey: translationKeys.one(entity, entityId ?? ""),
    queryFn: () => translationService.get(entity, entityId as string),
    enabled: enabled && !!entityId,
  });

  const baseLocale = query.data?.base_locale ?? "vi";
  const locales = useMemo(
    () => query.data?.locales ?? config?.translationLocales ?? [],
    [query.data?.locales, config?.translationLocales],
  );
  // Memoised because progress() depends on it: a fresh [] every render would
  // rebuild that callback on every keystroke.
  const fields = useMemo(
    () => query.data?.translatable_fields ?? [],
    [query.data?.translatable_fields],
  );

  const [locale, setLocale] = useState(baseLocale);
  // Edits per locale, applied over whatever the server returned.
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>(
    {},
  );

  const stored = useCallback(
    (loc: string): Record<string, unknown> =>
      query.data?.translations[loc]?.values ?? {},
    [query.data],
  );

  const valuesOf = useCallback(
    (loc: string) => ({ ...stored(loc), ...(edits[loc] ?? {}) }),
    [stored, edits],
  );

  const setField = useCallback(
    (field: string, value: unknown) =>
      setEdits((prev) => ({
        ...prev,
        [locale]: { ...(prev[locale] ?? {}), [field]: normalize(value) },
      })),
    [locale],
  );

  const progress = useCallback(
    (loc: string): LocaleProgress => {
      const v = valuesOf(loc);
      return {
        done: fields.filter((f) => filled(v[f])).length,
        total: fields.length,
      };
    },
    [valuesOf, fields],
  );

  // Which languages actually differ from what the server holds. Computed rather
  // than "has anything been typed", because a rich-text editor fires onChange
  // once on mount with an empty paragraph: without this, opening a language tab
  // would mark the page unsaved and then write that empty body back.
  const changed = useMemo(
    () =>
      Object.keys(edits).filter((loc) => {
        const before = stored(loc);
        const after = valuesOf(loc);
        return Object.keys(after).some((k) => !same(after[k], before[k] ?? ""));
      }),
    [edits, stored, valuesOf],
  );

  const flush = useCallback(
    async (id: string) => {
      if (!enabled || changed.length === 0) return;
      for (const loc of changed) {
        await translationService.put(entity, id, loc, valuesOf(loc));
      }
      setEdits({});
      await qc.invalidateQueries({ queryKey: translationKeys.one(entity, id) });
    },
    [changed, enabled, entity, valuesOf, qc],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !entityId) return;
    await qc.invalidateQueries({
      queryKey: translationKeys.one(entity, entityId),
    });
  }, [enabled, entity, entityId, qc]);

  return {
    enabled,
    baseLocale,
    tabs: [baseLocale, ...locales],
    locale,
    setLocale,
    isBase: locale === baseLocale,
    fields,
    values: valuesOf(locale),
    setField,
    dirty: changed.length > 0,
    progress,
    requiresRepublish: query.data?.requires_republish ?? false,
    flush,
    refresh,
  };
}

export type { TranslationView };
