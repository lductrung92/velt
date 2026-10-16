import { describe, expect, it } from "vitest";

import {
  applyDrop,
  changedSlots,
  blockWarning,
  fromDetails,
  paletteMenuId,
  paletteWidgetId,
  resolveSlot,
  slotDroppableId,
  slotKey,
  toInput,
  type BlockDraft,
  type RegionsDraft,
} from "./regionBlocks";

import type { WidgetConfig, WidgetType } from "../components/widgetCatalog";
import type {
  Group,
  RegionBlock,
  RegionGroupDetail,
  Slot,
} from "../services/regions.service";

const CONFIGS: Record<string, WidgetConfig> = {
  articles_list: { limit: 6, columns: 3 },
  rich_text: { width: "normal" },
};
const configFor = (type: WidgetType) => CONFIGS[type] ?? {};

// Mirrors the tree the API sends, which is where the real one lives.
const PARENT: Record<string, Group | null> = {
  common: null,
  blog: "common",
  blog_detail: "blog",
  home: "common",
};

function group(
  group: Group,
  ...slots: { slot: Slot; blocks: RegionBlock[] }[]
): RegionGroupDetail {
  return { group, parent: PARENT[group] ?? "common", slots };
}

/** The group list as the server would send it for these fixtures. */
const TREE: RegionGroupDetail[] = [
  group("common", at("header"), at("footer")),
  group("home", at("header"), at("footer")),
  group("blog", at("header"), at("footer")),
  group(
    "blog_detail",
    at("header"),
    at("footer"),
    at("sidebar_left"),
    at("after_article"),
  ),
];

function at(slot: Slot, ...blocks: RegionBlock[]) {
  return { slot, blocks };
}

function widget(id: string, type: WidgetType): RegionBlock {
  return {
    id,
    kind: "widget",
    widget_type: type,
    menu_id: null,
    config: configFor(type),
    is_visible: true,
  };
}

function menu(id: string, menuId: string): RegionBlock {
  return {
    id,
    kind: "menu",
    widget_type: null,
    menu_id: menuId,
    config: {},
    is_visible: true,
  };
}

/** The board as the API would hand it over: every allowed slot, most empty. */
function board(): RegionsDraft {
  return fromDetails([
    group(
      "common",
      at("header", menu("b1", "m-header"), widget("b2", "articles_list")),
      at("footer", menu("b3", "m-footer")),
    ),
    group("home", at("header"), at("footer")),
    group("blog", at("header"), at("footer")),
    group(
      "blog_detail",
      at("header"),
      at("footer"),
      at("sidebar_left", widget("b4", "rich_text")),
      at("after_article"),
    ),
  ]);
}

const COMMON_HEADER = slotKey("common", "header");
const COMMON_FOOTER = slotKey("common", "footer");
const BLOG_FOOTER = slotKey("blog_detail", "footer");
const BLOG_AFTER = slotKey("blog_detail", "after_article");
const BLOG_SIDEBAR = slotKey("blog_detail", "sidebar_left");

describe("regionBlocks", () => {
  it("drags a palette widget into a slot, creating a new id-less block", () => {
    const res = applyDrop(
      board(),
      paletteWidgetId("articles_list"),
      slotDroppableId(BLOG_AFTER),
      configFor,
    );

    expect(res).not.toBeNull();
    expect(res?.next[BLOG_AFTER]).toHaveLength(1);
    expect(res?.next[BLOG_AFTER][0]).toMatchObject({
      id: null,
      kind: "widget",
      widget_type: "articles_list",
      menu_id: null,
      config: { limit: 6, columns: 3 },
      is_visible: true,
    });
    // The drop selects what it created, and leaves the other slots alone.
    expect(res?.key).toBe(res?.next[BLOG_AFTER][0].key);
    expect(res?.next[COMMON_HEADER].map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("drags a palette menu onto an existing block, inserting above it", () => {
    const res = applyDrop(board(), paletteMenuId("m-footer"), "b2", configFor);

    expect(res?.next[COMMON_HEADER].map((b) => b.id)).toEqual([
      "b1",
      null,
      "b2",
    ]);
    expect(res?.next[COMMON_HEADER][1]).toMatchObject({
      kind: "menu",
      menu_id: "m-footer",
      widget_type: null,
    });
  });

  it("reorders within a slot", () => {
    const res = applyDrop(board(), "b1", "b2", configFor);
    expect(res?.next[COMMON_HEADER].map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(res?.key).toBe("b1");
  });

  it("moves a block between slots, keeping its id", () => {
    const res = applyDrop(
      board(),
      "b4",
      slotDroppableId(BLOG_AFTER),
      configFor,
    );
    expect(res?.next[BLOG_SIDEBAR].map((b) => b.id)).toEqual([]);
    expect(res?.next[BLOG_AFTER].map((b) => b.id)).toEqual(["b4"]);
  });

  it("keeps widgets out of the header and the footer, menus welcome", () => {
    const base = board();
    // A new one from the library.
    expect(
      applyDrop(
        base,
        paletteWidgetId("rich_text"),
        slotDroppableId(COMMON_FOOTER),
        configFor,
      ),
    ).toBeNull();
    // And one already on the board, dragged in from a rail.
    expect(
      applyDrop(base, "b4", slotDroppableId(COMMON_FOOTER), configFor),
    ).toBeNull();
    // A menu is what the chrome is for.
    expect(
      applyDrop(
        base,
        paletteMenuId("m-header"),
        slotDroppableId(COMMON_FOOTER),
        configFor,
      )?.next[COMMON_FOOTER],
    ).toHaveLength(2);
    // What an older build already put there still reorders.
    expect(applyDrop(base, "b2", "b1", configFor)?.next[COMMON_HEADER]).toEqual(
      [base[COMMON_HEADER][1], base[COMMON_HEADER][0]],
    );
  });

  it("ignores a drop that changes nothing", () => {
    expect(applyDrop(board(), "b1", "b1", configFor)).toBeNull();
    expect(applyDrop(board(), "b1", "nope", configFor)).toBeNull();
  });

  it("reports only the slots whose list actually changed", () => {
    const base = board();
    const moved = applyDrop(base, "b1", "b2", configFor)?.next as RegionsDraft;
    expect(changedSlots(moved, base)).toEqual([COMMON_HEADER]);

    // Config key order differs between the server payload and an edit that
    // spreads it — that must not read as a change.
    const reordered: RegionsDraft = {
      ...base,
      [COMMON_HEADER]: [
        base[COMMON_HEADER][0],
        // Same values, reversed key order.
        {
          ...base[COMMON_HEADER][1],
          config: { columns: 3, limit: 6 },
        },
      ],
    };
    expect(changedSlots(reordered, base)).toEqual([]);
  });

  it("sends the id of a block that already has one and omits it otherwise", () => {
    const next = applyDrop(
      board(),
      paletteWidgetId("rich_text"),
      slotDroppableId(BLOG_SIDEBAR),
      configFor,
    )?.next as RegionsDraft;

    expect(toInput(next[BLOG_SIDEBAR])).toEqual([
      {
        id: "b4",
        kind: "widget",
        widget_type: "rich_text",
        menu_id: null,
        config: { width: "normal" },
        is_visible: true,
      },
      {
        kind: "widget",
        widget_type: "rich_text",
        menu_id: null,
        config: { width: "normal" },
        is_visible: true,
      },
    ]);
  });
});

describe("inheritance", () => {
  it("falls through to the nearest ancestor that has anything", () => {
    const draft = board();
    // blog_detail fills neither header nor footer, so both come from common.
    expect(resolveSlot(draft, TREE, "blog_detail", "footer")).toMatchObject({
      from: "common",
    });
    expect(
      resolveSlot(draft, TREE, "blog_detail", "footer").blocks.map((b) => b.id),
    ).toEqual(["b3"]);
  });

  it("stops at a group's own list — override, never merge", () => {
    // Merging would leave no way to say "not on this kind of page", and no way
    // to tell by looking where a block came from.
    const draft = {
      ...board(),
      [BLOG_FOOTER]: [{ ...widget("own", "rich_text"), key: "own" }],
    };
    const shown = resolveSlot(draft, TREE, "blog_detail", "footer");
    expect(shown.from).toBe("blog_detail");
    expect(shown.blocks.map((b) => b.id)).toEqual(["own"]);
  });

  it("walks past an empty middle group to its grandparent", () => {
    const draft = board();
    // blog_detail → blog (empty) → common.
    expect(resolveSlot(draft, TREE, "blog_detail", "header").from).toBe(
      "common",
    );
  });

  it("reports nothing when no ancestor has anything either", () => {
    expect(resolveSlot(board(), TREE, "home", "header")).toMatchObject({
      from: "common",
    });
    expect(resolveSlot(emptyBoard(), TREE, "home", "header")).toEqual({
      blocks: [],
      from: null,
    });
  });
});

function emptyBoard(): RegionsDraft {
  return fromDetails([]);
}

describe("blockWarning", () => {
  const draft = (over: Partial<BlockDraft>): BlockDraft => ({
    key: "k",
    id: null,
    kind: "widget",
    widget_type: "rich_text",
    menu_id: null,
    config: {},
    is_visible: true,
    ...over,
  });

  it("says SKIPPED for a menu block with no menu chosen", () => {
    expect(blockWarning(draft({ kind: "menu", widget_type: null }))).toBe(
      "skipped",
    );
    expect(
      blockWarning(draft({ kind: "menu", widget_type: null, menu_id: "m1" })),
    ).toBeNull();
  });

  it("says SKIPPED for rich text whose html is only empty markup", () => {
    // An editor that has only been focused reports "<p></p>"; the site draws
    // nothing for it, so neither should this read as configured.
    expect(blockWarning(draft({ config: { html: "" } }))).toBe("skipped");
    expect(blockWarning(draft({ config: { html: "<p></p>" } }))).toBe(
      "skipped",
    );
    expect(blockWarning(draft({ config: { html: "<p>xin chào</p>" } }))).toBe(
      null,
    );
  });

  it("says SKIPPED for a CTA with no heading, no sub and no usable button", () => {
    const cta = (config: Record<string, unknown>) =>
      blockWarning(draft({ widget_type: "cta_banner", config }));
    expect(cta({})).toBe("skipped");
    // A button needs both halves; a label with no href links nowhere.
    expect(cta({ buttons: [{ label: "Liên hệ" }] })).toBe("skipped");
    expect(cta({ buttons: [{ label: "Liên hệ", href: "/#contact" }] })).toBe(
      null,
    );
    expect(cta({ heading: "Cần tư vấn?" })).toBe(null);
  });

  it("says nothing about a list with no category", () => {
    // Every category is the picker's first option and a real choice, so the
    // block is configured, not unfinished. Flagging it nagged about a setting
    // that works, and a warning read as nagging stops being read.
    expect(blockWarning(draft({ widget_type: "product_grid" }))).toBeNull();
    expect(blockWarning(draft({ widget_type: "articles_list" }))).toBeNull();
    expect(
      blockWarning(
        draft({ widget_type: "product_grid", config: { category: "do-choi" } }),
      ),
    ).toBeNull();
  });

  it("leaves the categories block alone — showing them all is its job", () => {
    expect(blockWarning(draft({ widget_type: "categories_showcase" }))).toBe(
      null,
    );
  });
});
