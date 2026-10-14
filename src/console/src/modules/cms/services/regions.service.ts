import api from "@/services/api";

import type { WidgetConfig, WidgetType } from "../components/widgetCatalog";

// Mirrors the Go backend exactly (backend/internal/modules/cms/regions).
// Design: docs/domains/cms/regions.md.
//
// A block lives at a (page group, slot) pair. A slot is a physical place in the
// site's chrome — the header, the article's left rail, the footer. A page group
// is a kind of page, and a group inherits its parent's blocks for any slot it
// does not fill itself. That is what finally answers "which menu renders here":
// you put the one you want in the group you mean.
//
// Blocks have NO per-block endpoint: one slot's whole list is replaced in a
// single PUT, the way a menu's item tree is, and ids the body carries survive.

/**
 * The vocabulary is the SERVER's, not ours.
 *
 * GET /cms/regions answers with every group, its parent, and the slots that
 * group is allowed to fill. Keeping a second copy here would mean the console
 * silently hides a slot the backend has started accepting. These unions exist
 * only so a key like `cms.appearance.group.<g>` is checked at compile time; a
 * group the backend adds and we have not named yet shows as a missing string,
 * which the screen's own test catches.
 */
export type Group =
  | "common"
  | "home"
  | "products"
  | "product_list"
  | "product_detail"
  | "blog"
  | "blog_list"
  | "blog_detail"
  | "not_found";

export type Slot =
  | "header"
  | "footer"
  | "sidebar_left"
  | "after_article"
  | "aside";

/** Groups that hold inherited blocks but match no page of their own. */
export const GROUPING_ONLY: Group[] = ["products", "blog"];

export type BlockKind = "widget" | "menu";

export interface RegionBlock {
  id: string;
  kind: BlockKind;
  /** Set when kind is "widget". */
  widget_type: WidgetType | null;
  /** Set when kind is "menu". */
  menu_id: string | null;
  config: WidgetConfig;
  is_visible: boolean;
}

/** A block on its way to the server; `id` absent means it is new. */
export interface RegionBlockInput {
  id?: string;
  kind: BlockKind;
  widget_type: WidgetType | null;
  menu_id: string | null;
  config: WidgetConfig;
  is_visible: boolean;
}

export interface RegionSlotDetail {
  slot: Slot;
  blocks: RegionBlock[];
}

export interface RegionGroupDetail {
  group: Group;
  /** Null at the root. Where this group reads a slot it does not fill itself. */
  parent: Group | null;
  slots: RegionSlotDetail[];
}

/** The chain from a group up to the root, nearest first. */
export function ancestry(
  group: Group,
  groups: RegionGroupDetail[],
): Group[] {
  const parentOf = new Map(groups.map((g) => [g.group, g.parent]));
  const chain: Group[] = [group];
  let parent = parentOf.get(group) ?? null;
  // A cycle would hang the walk; the server owns the tree, so guard rather
  // than trust.
  while (parent && !chain.includes(parent)) {
    chain.push(parent);
    parent = parentOf.get(parent) ?? null;
  }
  return chain;
}

export const regionsService = {
  async list(): Promise<RegionGroupDetail[]> {
    const { data } = await api.get<RegionGroupDetail[]>("/cms/regions");
    return data;
  },

  async replaceBlocks(
    group: Group,
    slot: Slot,
    blocks: RegionBlockInput[],
  ): Promise<RegionSlotDetail> {
    const { data } = await api.put<RegionSlotDetail>(
      `/cms/regions/${group}/${slot}/blocks`,
      { blocks },
    );
    return data;
  },
};
