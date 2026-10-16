import { ancestry, type Group, type Slot } from "../services/regions.service";

import type { WidgetConfig, WidgetType } from "../components/widgetCatalog";
import type { MenuSlot } from "../services/menus.service";
import type {
  BlockKind,
  RegionBlockInput,
  RegionGroupDetail,
} from "../services/regions.service";

/**
 * One block while it is being edited. `id` is null until the server assigns
 * one; `key` is the stable React/dnd-kit handle, which a brand-new block needs
 * before it has an id and which must survive a reorder.
 */
export interface BlockDraft {
  key: string;
  id: string | null;
  kind: BlockKind;
  widget_type: WidgetType | null;
  menu_id: string | null;
  config: WidgetConfig;
  is_visible: boolean;
}

/**
 * Where a block lives, as one string.
 *
 * The draft is a flat map rather than a map of maps because every operation on
 * it — drag, fingerprint, save — cares about "this one list", never about a
 * group's slots as a set.
 */
export type SlotKey = string;
export const slotKey = (group: Group, slot: Slot): SlotKey =>
  `${group}/${slot}`;
export const splitSlotKey = (key: SlotKey): { group: Group; slot: Slot } => {
  const [group, slot] = key.split("/");
  return { group: group as Group, slot: slot as Slot };
};

export type RegionsDraft = Record<SlotKey, BlockDraft[]>;

/**
 * The two slots every group has, and the only ones that take menus alone.
 *
 * A header and a footer are navigation; a product grid in them is a content
 * block that happens to sit above the page. The rails (sidebar, after_article,
 * aside) take either. Enforced in `applyDrop` rather than in the palette, so a
 * drag cannot route around the rule the + button obeys.
 */
export const CHROME_SLOTS: Slot[] = ["header", "footer"];
export const acceptsWidgets = (slot: Slot) => !CHROME_SLOTS.includes(slot);

/** Where a drag ended: a slot plus the index to insert at. */
export interface DropTarget {
  at: SlotKey;
  index: number;
}

// dnd-kit ids. Palette entries create a block; a slot container accepts a drop
// into empty space; a block's own key is its sortable id.
export const paletteWidgetId = (type: WidgetType) => `pal:w:${type}`;
export const paletteMenuId = (menuId: string) => `pal:m:${menuId}`;
export const slotDroppableId = (at: SlotKey) => `slot:${at}`;

let seq = 0;

/** Row label: a widget names its type, a menu names the slot it points at. */
export function blockLabel(
  block: BlockDraft,
  menus: MenuSlot[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (block.kind === "menu") {
    const name = menus.find((m) => m.id === block.menu_id)?.name;
    return name
      ? t("cms.appearance.menu_block", { name })
      : t("cms.appearance.menu_missing");
  }
  return t(`cms.pages.widget.${block.widget_type}.name`);
}

/**
 * What is wrong with a block, judged from its config alone — or null.
 *
 * One outcome, and only where it is certainly true: a menu with no menu, empty
 * rich text and an empty CTA are DROPPED by the site. These mirror the null
 * branches in src/site/app/components/RegionSlot.tsx, so the warning states
 * what will happen rather than what might.
 *
 * A list with no category is NOT one of them. Every category is a real choice
 * — it is the first option in the picker and what the block does without one —
 * so flagging it was nagging about a setting that works. And what any list
 * does when the server finds no records is beyond this side's knowledge.
 */
export type BlockWarning = "skipped";

const trimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function blockWarning(block: BlockDraft): BlockWarning | null {
  if (block.kind === "menu") return block.menu_id ? null : "skipped";
  const config = block.config;

  if (block.widget_type === "rich_text") {
    // An editor that has only been focused still reports "<p></p>".
    const text = trimmed(config.html)
      .replace(/<[^>]*>/g, "")
      .trim();
    return text === "" ? "skipped" : null;
  }

  if (block.widget_type === "cta_banner") {
    const buttons = Array.isArray(config.buttons) ? config.buttons : [];
    const usable = buttons.filter((b) => {
      const button = (b ?? {}) as Record<string, unknown>;
      return trimmed(button.label) && trimmed(button.href);
    });
    const bare =
      !trimmed(config.heading) && !trimmed(config.sub) && usable.length === 0;
    return bare ? "skipped" : null;
  }

  return null;
}

export function emptyDraft(): RegionsDraft {
  return {};
}

/**
 * The draft's keys ARE the server's answer: one entry per (group, slot) it says
 * exists. Nothing here decides what a group may fill — that vocabulary belongs
 * to the backend, and a second copy would drift.
 */
export function fromDetails(
  details: RegionGroupDetail[] | undefined,
): RegionsDraft {
  const draft: RegionsDraft = {};
  for (const group of details ?? []) {
    for (const slot of group.slots) {
      draft[slotKey(group.group, slot.slot)] = slot.blocks.map((b) => ({
        ...b,
        key: b.id,
      }));
    }
  }
  return draft;
}

/**
 * What a group actually shows in a slot, and where it came from.
 *
 * Inheritance is OVERRIDE, not merge (docs §6): the nearest ancestor with a
 * non-empty list wins outright. Merging would leave no way to say "not on this
 * kind of page", and no way to tell by looking where a block came from.
 */
export function resolveSlot(
  draft: RegionsDraft,
  groups: RegionGroupDetail[],
  group: Group,
  slot: Slot,
): { blocks: BlockDraft[]; from: Group | null } {
  for (const ancestor of ancestry(group, groups)) {
    const blocks = draft[slotKey(ancestor, slot)];
    if (blocks && blocks.length > 0) {
      return { blocks, from: ancestor };
    }
  }
  return { blocks: [], from: null };
}

/**
 * The draft key each saved row belongs to.
 *
 * A slot is replaced as one ordered list, so the server answers in the order it
 * was sent — position is the only link between a block that had no id and the
 * row it has just become. It is what lets a translation typed before the save
 * find its block afterwards.
 */
export function pairSavedIDs(
  drafts: BlockDraft[],
  saved: { id: string }[],
): Array<[key: string, id: string]> {
  return drafts.flatMap((block, index) =>
    saved[index] ? [[block.key, saved[index].id] as [string, string]] : [],
  );
}

/** Strips the local key and keeps the id, which the PUT needs to reuse the row. */
export function toInput(blocks: BlockDraft[]): RegionBlockInput[] {
  return blocks.map((b) => ({
    ...(b.id ? { id: b.id } : {}),
    kind: b.kind,
    widget_type: b.widget_type,
    menu_id: b.menu_id,
    config: b.config,
    is_visible: b.is_visible,
  }));
}

// Config comes back as parsed JSON, so key order is whatever the server chose;
// sorting before stringifying keeps an untouched region from reading as dirty.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, stable(obj[k])]),
    );
  }
  return value;
}

// Compared as the server will see it, which is also what drops the local key.
function fingerprint(blocks: BlockDraft[]): string {
  return JSON.stringify(stable(toInput(blocks)));
}

/** The slots whose block list differs from the baseline — the only ones to PUT. */
export function changedSlots(
  draft: RegionsDraft,
  baseline: RegionsDraft,
): SlotKey[] {
  const keys = new Set([...Object.keys(draft), ...Object.keys(baseline)]);
  return [...keys].filter(
    (at) => fingerprint(draft[at] ?? []) !== fingerprint(baseline[at] ?? []),
  );
}

export function findBlock(
  draft: RegionsDraft,
  key: string,
): { at: SlotKey; index: number } | null {
  for (const at of Object.keys(draft)) {
    const index = draft[at].findIndex((b) => b.key === key);
    if (index >= 0) return { at, index };
  }
  return null;
}

function parsePalette(
  id: string,
): Pick<BlockDraft, "kind" | "widget_type" | "menu_id" | "config"> | null {
  if (id.startsWith("pal:w:"))
    return {
      kind: "widget",
      widget_type: id.slice(6) as WidgetType,
      menu_id: null,
      config: {},
    };
  if (id.startsWith("pal:m:"))
    return {
      kind: "menu",
      widget_type: null,
      menu_id: id.slice(6),
      config: {},
    };
  return null;
}

/** Resolves what dnd-kit was hovering over into a slot + insert index. */
export function dropTarget(
  draft: RegionsDraft,
  overId: string,
): DropTarget | null {
  if (overId.startsWith("slot:")) {
    const at = overId.slice(5);
    if (!(at in draft)) return null;
    return { at, index: draft[at].length };
  }
  const found = findBlock(draft, overId);
  return found ? { at: found.at, index: found.index } : null;
}

/**
 * Resolves one drag into the next draft. Covers all three gestures — palette →
 * slot creates, slot → slot moves, same-slot reorders — because they differ
 * only in where the block comes from. Returns null when nothing moved, and
 * otherwise the key of the block that landed, so the caller can select it.
 */
export function applyDrop(
  draft: RegionsDraft,
  activeId: string,
  overId: string,
  defaultConfigFor: (type: WidgetType) => WidgetConfig,
): { next: RegionsDraft; key: string } | null {
  const target = dropTarget(draft, overId);
  if (!target) return null;

  // What is moving: a new block from the palette, or one already on the board.
  const palette = parsePalette(activeId);
  const from = palette ? null : findBlock(draft, activeId);
  const moving = palette ?? (from ? draft[from.at][from.index] : null);
  if (!moving) return null;
  // Only entering a slot is judged: a widget an older build left in the header
  // can still be reordered and removed, it just cannot be joined by another.
  const entering = !from || from.at !== target.at;
  if (
    entering &&
    moving.kind === "widget" &&
    !acceptsWidgets(splitSlotKey(target.at).slot)
  )
    return null;

  if (palette) {
    const block: BlockDraft = {
      ...palette,
      key: `new-${++seq}`,
      id: null,
      config: palette.widget_type ? defaultConfigFor(palette.widget_type) : {},
      is_visible: true,
    };
    const next = { ...draft, [target.at]: [...draft[target.at]] };
    next[target.at].splice(target.index, 0, block);
    return { next, key: block.key };
  }

  if (!from) return null;
  if (from.at === target.at && from.index === target.index) return null;

  const block = draft[from.at][from.index];
  const next = { ...draft };
  next[from.at] = draft[from.at].filter((_, i) => i !== from.index);
  // Insert at the hovered block's index in the list as it stands AFTER the
  // removal — arrayMove's convention, which is what dnd-kit's own preview
  // animates towards while the drag is in flight.
  const list = [...next[target.at]];
  list.splice(target.index, 0, block);
  next[target.at] = list;
  return { next, key: block.key };
}
