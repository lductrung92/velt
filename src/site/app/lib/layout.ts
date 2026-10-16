import type { PublicMenuItem } from "../types";
import type { T } from "./i18n";
import { emptyRegions, resolveRegions, type SiteRegions } from "./regions";

/**
 * The site's chrome — the header and the footer — as data.
 *
 * Both used to be written into the markup. They are now edited in the console:
 * the links come from the menu builder (one slot per `location`), the words
 * around them from the `site.*` settings. This module is the whole translation
 * between what the API sends and what the two components render, and it holds
 * the defaults.
 *
 * Those defaults are the copy the page shipped with, and they are what the site
 * renders when the console has nothing to say — an empty menu, a blank setting,
 * an API that is down. That is not a degraded mode: it is the page as it looks
 * today, and it stays the answer until somebody deliberately edits it.
 */

export interface NavItem {
  label: string;
  /** One line under the label (header dropdown); "" renders nothing. */
  description: string;
  href: string;
  newTab: boolean;
  /** A non-empty list makes this a dropdown (header) or a column (footer). */
  children: NavItem[];
}

/** The words around the navigation; each one falls back to the copy below. */
export interface SiteChrome {
  tagline: string;
  /** {year} is replaced at render time. */
  copyright: string;
  /** Empty = the logo the site ships with. */
  logoUrl: string;
  /** How to reach the company when no member is in play. */
  contactEmail: string;
  contactZalo: string;
  /** Shown in the footer only when filled. */
  phone: string;
  address: string;
  /** Each link is an icon in the footer, and only when it is filled. */
  social: { key: string; href: string }[];
}

/**
 * What the document head says.
 *
 * It travels with the layout because it comes from the same read, but it is
 * kept apart: these values are not words on the page, they are instructions to
 * a browser and to a crawler.
 */
export interface SiteHead {
  faviconUrl: string;
  ogImageUrl: string;
  primaryColor: string;
  /** True while the site should be kept out of search results entirely. */
  noindexAll: boolean;
  verification: string;
  analyticsId: string;
  /** How many cards a listing page shows. */
  blogPageSize: number;
  productsPageSize: number;
  /** reCAPTCHA for the contact form. The site key is public by design — the
   *  browser cannot render the widget without it. The secret never comes near
   *  here; only the API ever sees it. */
  recaptchaSiteKey: string;
}

export interface SiteLayout {
  header: NavItem[];
  footer: NavItem[];
  chrome: SiteChrome;
  head: SiteHead;
  /** Blocks the console placed in the chrome; empty lists render nothing. */
  regions: SiteRegions;
}

function nav(
  label: string,
  href: string,
  extra: Partial<NavItem> = {},
): NavItem {
  return {
    label,
    href,
    description: "",
    newTab: false,
    children: [],
    ...extra,
  };
}

export const defaultHeader = (t: T): NavItem[] => [
  nav(t("layout.nav.explore"), "/", {
    children: [
      nav(t("layout.nav.products"), "/products", {
        description: t("layout.nav.products_desc"),
      }),
      nav(t("layout.nav.team"), "/#team", {
        description: t("layout.nav.team_desc"),
      }),
    ],
  }),
  nav(t("layout.nav.products"), "/products"),
  nav(t("layout.nav.team"), "/#team"),
  nav(t("layout.nav.blog"), "/blog"),
];

// A root is a column heading (its own href is never rendered); its children are
// the links inside that column.
export const defaultFooter = (t: T): NavItem[] => [
  nav(t("layout.footer.explore"), "/", {
    children: [
      nav(t("layout.footer.about"), "/#about"),
      nav(t("layout.nav.products"), "/#products"),
      nav(t("layout.nav.team"), "/#team"),
      nav(t("layout.nav.blog"), "/blog"),
    ],
  }),
  nav(t("layout.footer.buy"), "/", {
    children: [
      nav(t("layout.nav.how_to_buy"), "/#collaboration"),
      nav(t("layout.footer.contact"), "/#contact"),
    ],
  }),
];

/** Where the header's button points when nothing else says otherwise. */

export const defaultChrome = (t: T): SiteChrome => ({
  tagline: t("layout.chrome.tagline"),
  copyright: t("layout.chrome.copyright"),
  logoUrl: "",
  contactEmail: "",
  contactZalo: "",
  phone: "",
  address: "",
  social: [],
});

/** Nothing configured: the site's own icon, no tracking, pages of nine. */
export const DEFAULT_HEAD: SiteHead = {
  faviconUrl: "",
  ogImageUrl: "",
  primaryColor: "",
  noindexAll: false,
  verification: "",
  analyticsId: "",
  blogPageSize: 9,
  productsPageSize: 9,
  // Nothing configured means no protection to render. The API still decides
  // whether a token was required, so an absent key here cannot wave a
  // submission through.
  recaptchaSiteKey: "",
};

export const defaultLayout = (t: T): SiteLayout => ({
  header: defaultHeader(t),
  footer: defaultFooter(t),
  chrome: defaultChrome(t),
  head: DEFAULT_HEAD,
  regions: emptyRegions(),
});

/** A setting read as text; anything that is not a non-blank string is absent. */
function str(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

/**
 * Where a menu item points.
 *
 * The backend deliberately sends link_type + slug rather than a URL, because
 * the site owns its URL layout. This function IS that layout, and it is the one
 * place to change when a route moves. An item it cannot place returns "" and is
 * dropped by the caller — a visitor is better served by a missing entry than by
 * a link into a 404.
 */
function hrefOf(item: PublicMenuItem, homeSlug: string): string {
  const url = str(item.url).trim();
  const slug = str(item.slug).trim();
  switch (item.link_type) {
    case "internal":
      return url.startsWith("/") ? url : "";
    case "external":
      return /^https?:\/\//i.test(url) ? url : "";
    case "article":
      return slug ? `/blog/${encodeURIComponent(slug)}` : "";
    case "page":
      // The page serving "/" is reachable at "/" — linking to its slug would
      // send visitors to a second address for the same page.
      if (!slug) return "";
      return slug === homeSlug ? "/" : `/${encodeURIComponent(slug)}`;
    case "category":
      return slug ? `/blog?category=${encodeURIComponent(slug)}` : "";
    default:
      return "";
  }
}

/** Converts one slot's published items into nav items, dropping the unusable. */
function toNav(items: unknown, homeSlug: string): NavItem[] {
  if (!Array.isArray(items)) return [];
  const out: NavItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as PublicMenuItem;
    const label = str(item.label).trim();
    if (!label) continue;
    const children = toNav(item.children, homeSlug);
    const href = hrefOf(item, homeSlug);
    // A heading (dropdown toggle, footer column) needs no destination of its
    // own; a leaf without one has nowhere to go and is left out.
    if (!href && children.length === 0) continue;
    out.push({
      label,
      description: str(item.description).trim(),
      href,
      newTab: item.open_new_tab === true,
      children,
    });
  }
  return out;
}

/** One slot of the published navigation, tolerant of a missing or odd payload. */
function slot(menus: unknown, location: string): unknown {
  if (!menus || typeof menus !== "object") return null;
  return (menus as Record<string, unknown>)[location];
}

/**
 * Builds the layout the components render, from the two public reads.
 *
 * Every branch here answers the same question the same way: if the console has
 * not said otherwise, show what the page already showed.
 */
export function resolveLayout(
  menus: unknown,
  settings: unknown,
  regions: unknown,
  t: T,
): SiteLayout {
  const values = (
    settings && typeof settings === "object" ? settings : {}
  ) as Record<string, unknown>;
  const homeSlug = str(values["cms.home_page_slug"]).trim();

  const header = toNav(slot(menus, "header"), homeSlug);
  const footer = toNav(slot(menus, "footer"), homeSlug);

  const shipped = defaultChrome(t);
  return {
    header: header.length ? header : defaultHeader(t),
    footer: footer.length ? footer : defaultFooter(t),
    chrome: {
      tagline: str(values["site.brand_tagline"]) || shipped.tagline,
      copyright: str(values["site.footer_copyright"]) || shipped.copyright,
      logoUrl: safeUrl(values["app.logo_url"]),
      contactEmail: str(values["site.contact_email"]).trim(),
      contactZalo: safeUrl(values["site.contact_zalo"]),
      phone: str(values["site.contact_phone"]).trim(),
      address: str(values["site.address"]).trim(),
      // Only the networks somebody filled in, in a fixed order so the footer
      // does not reshuffle itself between renders.
      social: (["facebook", "linkedin", "youtube", "github"] as const)
        .map((key) => ({ key, href: safeUrl(values[`site.social_${key}`]) }))
        .filter((item) => item.href !== ""),
    },
    head: {
      faviconUrl: safeUrl(values["app.favicon_url"]),
      ogImageUrl: safeUrl(values["site.og_image_url"]),
      primaryColor: color(values["app.primary_color"]),
      noindexAll: values["seo.noindex_all"] === true,
      verification: str(values["seo.google_site_verification"]).trim(),
      analyticsId: str(values["seo.analytics_id"]).trim(),
      // The floor is 1, matching the registry: a site with three posts is
      // allowed to show one per page. Keep these bounds in step with
      // internal/modules/cms/shared/settings.go — a value this clamp rejects
      // is silently replaced by the fallback, so a stricter floor here makes
      // the setting look broken rather than invalid.
      blogPageSize: count(values["site.blog_page_size"], 1, 24, 9),
      productsPageSize: count(values["site.products_page_size"], 1, 48, 9),
      // Empty whenever protection is off OR no key is stored, and the form
      // treats both the same: no widget, submit straight away. The API decides
      // whether a token was actually required — a browser cannot be trusted to
      // report that it skipped one.
      recaptchaSiteKey:
        values["security.recaptcha_enabled"] === true
          ? str(values["security.recaptcha_site_key"]).trim()
          : "",
    },
    regions: resolveRegions(regions),
  };
}

/**
 * A URL typed into a settings box, checked before it reaches the document.
 *
 * Same-origin paths and http(s) only: a `javascript:` logo would be a stored
 * XSS with a settings screen for a front door.
 */
function safeUrl(value: unknown): string {
  const raw = str(value).trim();
  if (raw.startsWith("/") || /^https?:\/\//i.test(raw)) return raw;
  return "";
}

/** A CSS colour, narrowed to the one shape the theme can use. */
function color(value: unknown): string {
  const raw = str(value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : "";
}

/** A page size, clamped to something a page can actually render. */
function count(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" &&
    Number.isInteger(parsed) &&
    parsed >= min &&
    parsed <= max
    ? parsed
    : fallback;
}

/**
 * The icon beside an entry in the header dropdown.
 *
 * The markup picked one per item by hand; a menu item has no icon field, so it
 * is derived from where the link goes. Anything unrecognised gets the catalogue
 * icon, which is what the dropdown showed for its first entry anyway.
 */
export function navIcon(href: string): string {
  if (href.includes("#team") || href.includes("/team")) return "users";
  if (href.includes("#contact") || href.includes("/contact")) return "support";
  return "grid";
}

/**
 * The address to put in an href.
 *
 * Internal paths go through the site's referral helper (it carries ?ref= across
 * the site); an absolute URL must not, because that helper resolves against the
 * site's own origin and would quietly drop the other host.
 */
export function navHref(item: NavItem, href: (path: string) => string): string {
  return /^https?:\/\//i.test(item.href) ? item.href : href(item.href);
}
