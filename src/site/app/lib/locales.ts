/**
 * Which language a request is in, and how that shows in the address.
 *
 * Vietnamese is the base language and keeps the bare URL — /blog/bai-viet. It
 * gets no /vi prefix, because adding one would change every address the site
 * has ever published, and the one thing a URL owes its readers is to keep
 * working. Every other language lives under its own prefix: /en/blog/....
 *
 * The prefix is deliberate, not a detail. Google's crawler sends no
 * Accept-Language header and crawls from one place, so a site that guesses the
 * language from the browser can leave entire languages unindexed. A language
 * per address, cross-linked with hreflang, is what makes both versions
 * reachable — and it makes the SSR cache correct for free, since the page cache
 * is keyed by path.
 */

export const BASE_LOCALE = "vi";

/** A prefix is a short lowercase code: /en, /ja, /zh-tw. */
const CODE = /^[a-z]{2}(-[a-z0-9]{2,8})?$/;

export interface LocaleConfig {
  /** Languages besides the base one, as the console configured them. */
  extras: string[];
}

/** Splits "/en/blog" into the language and the path the router should see. */
export function splitLocale(
  pathname: string,
  extras: string[],
): { locale: string; path: string } {
  const match = /^\/([^/?#]+)(\/.*)?$/.exec(pathname);
  if (match) {
    const code = match[1].toLowerCase();
    if (CODE.test(code) && extras.includes(code)) {
      return { locale: code, path: match[2] || "/" };
    }
  }
  return { locale: BASE_LOCALE, path: pathname };
}

/**
 * Puts a path into one language. Query and hash ride along untouched, which is
 * what keeps ?ref= working across a language switch.
 */
export function withLocale(path: string, locale: string): string {
  if (locale === BASE_LOCALE) return path;
  const cut = path.search(/[?#]/);
  const head = cut === -1 ? path : path.slice(0, cut);
  const tail = cut === -1 ? "" : path.slice(cut);
  if (!head.startsWith("/")) return path;
  return `/${locale}${head === "/" ? "" : head}${tail}`;
}

/** Strips a language prefix, giving the address in the base language. */
export function withoutLocale(path: string, extras: string[]): string {
  return splitLocale(path, extras).path;
}

/** Every language the site serves, base first. */
export function allLocales(extras: string[]): string[] {
  return [BASE_LOCALE, ...extras.filter((code) => code !== BASE_LOCALE)];
}

export interface Alternate {
  locale: string;
  href: string;
  /** The fallback search engines use for a language they have no entry for. */
  xDefault?: boolean;
}

/**
 * The hreflang set for one page.
 *
 * Every page lists every language INCLUDING itself: a set that does not
 * reference back is ignored, and x-default points at the base language, which
 * is what a reader with no matching language should land on.
 *
 * `slugs` overrides the address per language for content whose slug is itself
 * translated — an article published as /blog/xin-chao and /en/blog/hello is one
 * page in two languages, not two pages.
 */
export function alternatesFor(
  path: string,
  extras: string[],
  slugs?: Record<string, string>,
): Alternate[] {
  return allLocales(extras).map((locale) => {
    const target = slugs?.[locale] ?? path;
    return {
      locale,
      href: withLocale(target, locale),
      xDefault: locale === BASE_LOCALE,
    };
  });
}

/**
 * What a language is called in its own language.
 *
 * A reader looking for their language scans for a word they recognise, not for
 * a code — so this table is in the languages themselves, and an unlisted code
 * falls back to the code in capitals rather than to English.
 */
const LOCALE_LABEL: Record<string, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

export function localeLabel(code: string): string {
  return LOCALE_LABEL[code] || code.toUpperCase();
}
