import type { NavItem } from "./layout";

/**
 * Blocks the console placed in the site's chrome.
 *
 * A block is stored against a (page group, slot) pair. The SLOT is a physical
 * place in the layout — the header, the article's left column, the footer. The
 * GROUP is the kind of page it belongs to, a node in a tree whose root matches
 * every page, and a page takes, per slot, the list of the NEAREST ANCESTOR
 * THAT HAS ONE.
 *
 * The API sends the tree unflattened and the walk happens here, because this
 * side is the one that knows what kind of page it is rendering (`pageGroup` in
 * App.tsx). One read serves every page, which is what keeps the layout cache
 * one entry per language.
 *
 * The API leaves a group or a slot out of its answer entirely when nothing
 * visible is in it, and this file keeps that contract: absent means "not
 * configured", every slot renders nothing at all, and a site that never opens
 * the screen looks exactly as it always did.
 *
 * The blocks arrive already resolved — a menu as its item tree, a widget as the
 * data its renderer needs — because the resolution rules (a link to unpublished
 * content is dropped, a translated label wins) belong to the API that owns
 * them, not to four renderers here.
 */

/**
 * The page tree, child → parent, "" at the root.
 *
 * This is an EDITORIAL hierarchy, not a URL one: /products and /products/{slug}
 * share a parent because an editor thinks of them as one thing, not because
 * their paths nest. Which page is in which group is decided once, by the site's
 * own router — see `pageGroup` in App.tsx.
 */
export const PARENT_GROUP = {
  common: "",
  home: "common",
  products: "common",
  product_list: "products",
  product_detail: "products",
  blog: "common",
  blog_list: "blog",
  blog_detail: "blog",
  not_found: "common",
} as const;

export type PageGroup = keyof typeof PARENT_GROUP;

/** Every place in the markup a block can land, across all page kinds. */
export const SLOTS = [
  "header",
  "footer",
  "sidebar_left",
  "after_article",
  "aside",
] as const;

export type SlotName = (typeof SLOTS)[number];

/**
 * The widget types this build can draw.
 *
 * The console may offer a type before the site has a renderer for it, and a
 * block nothing can draw must not count towards "is this slot configured" —
 * otherwise the slot renders an empty wrapper into the header or the footer,
 * and the walk stops at a group that in truth declared nothing.
 */
const DRAWABLE = new Set([
  "rich_text",
  "cta_banner",
  "articles_list",
  "categories_showcase",
  "product_grid",
]);

export interface MenuBlock {
  kind: "menu";
  items: NavItem[];
}

export interface WidgetBlock {
  kind: "widget";
  widgetType: string;
  /**
   * The words the editor typed and the records the server fetched, in one
   * object. They are separate on the wire — a static widget like rich text
   * resolves to no data at all and is nothing but its config — but no widget
   * names the same key in both, and one bag is what a renderer actually wants.
   */
  props: Record<string, unknown>;
}

export type RegionBlock = MenuBlock | WidgetBlock;

/** What the console configured, by group then slot. A group with nothing in
 *  it is absent, which is what lets the walk fall through to its parent. */
export type SiteRegions = Partial<
  Record<PageGroup, Partial<Record<SlotName, RegionBlock[]>>>
>;

/** One page's slots, after the walk: every slot present, most of them empty. */
export type RegionSlots = Record<SlotName, RegionBlock[]>;

export function emptyRegions(): SiteRegions {
  return {};
}

export function emptySlots(): RegionSlots {
  return {
    header: [],
    footer: [],
    sidebar_left: [],
    after_article: [],
    aside: [],
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNavItems(raw: unknown): NavItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((node) => {
    const n = (node ?? {}) as Record<string, unknown>;
    return {
      label: str(n.label),
      description: str(n.description),
      href: str(n.href) || str(n.url),
      newTab: n.open_new_tab === true,
      children: toNavItems(n.children),
    };
  });
}

function toBlock(raw: unknown): RegionBlock | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.kind === "menu") {
    const items = toNavItems(b.items);
    // An empty menu is a block that would draw nothing; dropping it here keeps
    // the slot's "has anything?" check honest.
    return items.length ? { kind: "menu", items } : null;
  }
  if (b.kind === "widget") {
    const widgetType = str(b.widget_type);
    if (!DRAWABLE.has(widgetType)) return null;
    return {
      kind: "widget",
      widgetType,
      props: { ...obj(b.config), ...obj(b.data) },
    };
  }
  return null;
}

/** Narrow the API's answer; anything unrecognised is simply not rendered. */
export function resolveRegions(raw: unknown): SiteRegions {
  const out = emptyRegions();
  if (!raw || typeof raw !== "object") return out;
  const byGroup = raw as Record<string, unknown>;
  for (const group of Object.keys(PARENT_GROUP) as PageGroup[]) {
    const bySlot = byGroup[group];
    if (!bySlot || typeof bySlot !== "object") continue;
    const slots: Partial<Record<SlotName, RegionBlock[]>> = {};
    for (const slot of SLOTS) {
      const list = (bySlot as Record<string, unknown>)[slot];
      if (!Array.isArray(list)) continue;
      const blocks = list
        .map(toBlock)
        .filter((block): block is RegionBlock => block !== null);
      // An empty list is left out rather than stored empty: a group that
      // declares nothing must not stop the walk at itself.
      if (blocks.length) slots[slot] = blocks;
    }
    if (Object.keys(slots).length) out[group] = slots;
  }
  return out;
}

/**
 * The slots a page of this group renders, after walking up to the root.
 *
 * OVERRIDE, NOT MERGE: the nearest ancestor with a non-empty list wins outright
 * and the rest of the chain is not consulted for that slot. Merging would leave
 * no way to say "not this block on this page", and nothing on the editor's
 * screen would explain where a block had come from.
 */
export function slotsForGroup(
  regions: SiteRegions,
  group: PageGroup,
): RegionSlots {
  const out = emptySlots();
  for (const slot of SLOTS) {
    for (let g: string = group; g; g = PARENT_GROUP[g as PageGroup]) {
      const list = regions[g as PageGroup]?.[slot];
      if (list && list.length) {
        out[slot] = list;
        break;
      }
    }
  }
  return out;
}
