import type { PublicMenuItem } from "../types";

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
  noteTitle: string;
  noteText: string;
  /** {year} is replaced at render time. */
  copyright: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface SiteLayout {
  header: NavItem[];
  headerMobile: NavItem[];
  footer: NavItem[];
  chrome: SiteChrome;
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

export const DEFAULT_HEADER: NavItem[] = [
  nav("Khám phá", "/", {
    children: [
      nav("Sản phẩm", "/products", {
        description: "Danh mục, tính năng và bản trải nghiệm",
      }),
      nav("Đội ngũ & kỹ năng", "/#team", {
        description: "Con người đứng sau ZUKATEK",
      }),
    ],
  }),
  nav("Sản phẩm", "/products"),
  nav("Đội ngũ & kỹ năng", "/#team"),
  nav("Blog", "/blog"),
];

// The phone menu is its own list on purpose: it is flat, and it carries one
// entry ("Cách mua sản phẩm") the desktop bar has no room for. A site that
// configures only the desktop menu gets this list derived from that one.
export const DEFAULT_HEADER_MOBILE: NavItem[] = [
  nav("Sản phẩm", "/products"),
  nav("Đội ngũ & kỹ năng", "/#team"),
  nav("Cách mua sản phẩm", "/#collaboration"),
  nav("Blog", "/blog"),
];

// A root is a column heading (its own href is never rendered); its children are
// the links inside that column.
export const DEFAULT_FOOTER: NavItem[] = [
  nav("Khám phá ZUKATEK", "/", {
    children: [
      nav("Về ZUKATEK", "/#about"),
      nav("Sản phẩm", "/#products"),
      nav("Đội ngũ & kỹ năng", "/#team"),
      nav("Blog", "/blog"),
    ],
  }),
  nav("Mua & sử dụng sản phẩm", "/", {
    children: [
      nav("Cách mua sản phẩm", "/#collaboration"),
      nav("Liên hệ", "/#contact"),
    ],
  }),
];

export const DEFAULT_CHROME: SiteChrome = {
  tagline: "Đội ngũ phát triển sản phẩm số\ncho cá nhân, nhóm và doanh nghiệp.",
  noteTitle: "Con người đứng sau sản phẩm",
  noteText:
    "Xem đội ngũ phát triển, kỹ năng\nvà thành viên phụ trách từng sản phẩm.",
  copyright: "© {year} ZUKATEK. Cùng tiến về phía trước.",
  ctaLabel: "Liên hệ",
  ctaHref: "/#contact",
};

export const DEFAULT_LAYOUT: SiteLayout = {
  header: DEFAULT_HEADER,
  headerMobile: DEFAULT_HEADER_MOBILE,
  footer: DEFAULT_FOOTER,
  chrome: DEFAULT_CHROME,
};

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

/**
 * Derives a flat phone menu from the desktop one: every entry that actually
 * leads somewhere, in order, without the duplicates a dropdown creates (the
 * desktop bar repeats its dropdown's entries as top-level links).
 */
export function flatten(items: NavItem[]): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  const walk = (list: NavItem[]) => {
    for (const item of list) {
      if (item.children.length > 0) {
        walk(item.children);
        continue;
      }
      if (!item.href || seen.has(item.href)) continue;
      seen.add(item.href);
      out.push({ ...item, description: "" });
    }
  };
  walk(items);
  return out;
}

/** One slot of the published navigation, tolerant of a missing or odd payload. */
function slot(menus: unknown, location: string): unknown {
  if (!menus || typeof menus !== "object") return null;
  return (menus as Record<string, unknown>)[location];
}

// The header button's target is typed into a settings box, so it is checked
// like any other link before it reaches the document.
function ctaHref(value: unknown): string {
  const raw = str(value).trim();
  if (raw.startsWith("/") || /^https?:\/\//i.test(raw)) return raw;
  return DEFAULT_CHROME.ctaHref;
}

/**
 * Builds the layout the components render, from the two public reads.
 *
 * Every branch here answers the same question the same way: if the console has
 * not said otherwise, show what the page already showed.
 */
export function resolveLayout(menus: unknown, settings: unknown): SiteLayout {
  const values = (
    settings && typeof settings === "object" ? settings : {}
  ) as Record<string, unknown>;
  const homeSlug = str(values["cms.home_page_slug"]).trim();

  const header = toNav(slot(menus, "header"), homeSlug);
  const mobile = toNav(slot(menus, "header_mobile"), homeSlug);
  const footer = toNav(slot(menus, "footer"), homeSlug);

  return {
    header: header.length ? header : DEFAULT_HEADER,
    headerMobile: mobile.length
      ? mobile
      : header.length
        ? flatten(header)
        : DEFAULT_HEADER_MOBILE,
    footer: footer.length ? footer : DEFAULT_FOOTER,
    chrome: {
      tagline: str(values["site.brand_tagline"]) || DEFAULT_CHROME.tagline,
      noteTitle:
        str(values["site.footer_note_title"]) || DEFAULT_CHROME.noteTitle,
      noteText: str(values["site.footer_note_text"]) || DEFAULT_CHROME.noteText,
      copyright:
        str(values["site.footer_copyright"]) || DEFAULT_CHROME.copyright,
      ctaLabel: str(values["site.header_cta_label"]) || DEFAULT_CHROME.ctaLabel,
      ctaHref: ctaHref(values["site.header_cta_url"]),
    },
  };
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
