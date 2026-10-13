import { BASE_LOCALE } from "./locales";
import { vi as commonVi, en as commonEn } from "./i18n/common";
import { vi as homeVi, en as homeEn } from "./i18n/home";
import { vi as blogVi, en as blogEn } from "./i18n/blog";
import { vi as catalogVi, en as catalogEn } from "./i18n/catalog";
import { vi as contactVi, en as contactEn } from "./i18n/contact";
import { vi as teamVi, en as teamEn } from "./i18n/team";

/**
 * The site's own words, in each language it serves.
 *
 * This is not a translation library. The site has sixteen components and ships
 * its HTML from the server, where every kilobyte of JavaScript is paid for in
 * page speed and page speed is paid for in search ranking — so the whole
 * mechanism is a lookup in a plain object, built at module load, with no
 * provider, no plugins and no runtime dependency.
 *
 * Two rules keep it honest:
 *
 *   • each area lives in its own module under i18n/, declared as `vi` and then
 *     `en: Record<keyof typeof vi, string>`, so a key translated in one
 *     language and forgotten in the other is a COMPILE error, not a blank spot
 *     a visitor finds;
 *   • a key missing at runtime all the same (an unknown language, a table that
 *     drifted) falls back to Vietnamese rather than to the key name — a
 *     visitor reading the wrong language is recoverable, a visitor reading
 *     "blog.empty_title" is not.
 *
 * Text the console owns is NOT here: section copy, menu labels and the footer
 * blurb come from the API, and these tables hold only what the site itself
 * says. The one exception is the built-in defaults for that copy, which are the
 * site's words until somebody writes their own.
 */

export const TABLES = {
  vi: {
    ...commonVi,
    ...homeVi,
    ...blogVi,
    ...catalogVi,
    ...contactVi,
    ...teamVi,
  },
  en: {
    ...commonEn,
    ...homeEn,
    ...blogEn,
    ...catalogEn,
    ...contactEn,
    ...teamEn,
  },
};

export type Dict = (typeof TABLES)["vi"];
export type MessageKey = keyof Dict;

/** Looks a message up, filling {placeholders} from `vars`. */
export type T = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function translator(locale: string): T {
  const table = (TABLES as Record<string, Dict>)[locale];
  return (key, vars) => {
    const raw = (table?.[key] ?? TABLES[BASE_LOCALE][key] ?? "") as string;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  };
}

/** The languages these tables actually carry — what a test can enumerate. */
export const TRANSLATED_LOCALES = Object.keys(TABLES);
