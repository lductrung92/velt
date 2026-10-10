import { describe, expect, it } from "vitest";

import type { MenuItemNode } from "../services/menus.service";
import {
  appendNode,
  applyDrop,
  findNode,
  flattenTree,
  fromNodes,
  getDescendantKeys,
  getProjection,
  removeDescendants,
  removeNode,
  toItemsInput,
  treesEqual,
  updateNode,
  type FlatMenuItem,
  type MenuItemDraft,
} from "./menuTree";

function node(
  key: string,
  children: MenuItemDraft[] = [],
  extra: Partial<MenuItemDraft> = {},
): MenuItemDraft {
  return {
    key,
    label: key,
    link_type: "internal",
    target_id: null,
    url: `/${key}`,
    open_new_tab: false,
    children,
    ...extra,
  };
}

function flat(
  key: string,
  parentKey: string | null,
  depth: number,
): FlatMenuItem {
  return {
    key,
    parentKey,
    depth,
    label: key,
    link_type: "internal",
    hasChildren: false,
  };
}

describe("flattenTree", () => {
  it("emits pre-order rows with depth + parentKey", () => {
    const tree = [node("a", [node("a1")]), node("b")];
    expect(flattenTree(tree).map((r) => [r.key, r.depth, r.parentKey])).toEqual(
      [
        ["a", 0, null],
        ["a1", 1, "a"],
        ["b", 0, null],
      ],
    );
  });

  it("marks nodes with children", () => {
    const tree = [node("a", [node("a1")])];
    const rows = flattenTree(tree);
    expect(rows.find((r) => r.key === "a")?.hasChildren).toBe(true);
    expect(rows.find((r) => r.key === "a1")?.hasChildren).toBe(false);
  });
});

describe("toItemsInput", () => {
  it("keeps url + nulls target_id for internal/external", () => {
    const tree = [
      node("x", [], {
        link_type: "external",
        url: "https://e.com",
        target_id: "leftover",
      }),
    ];
    expect(toItemsInput(tree)[0]).toMatchObject({
      link_type: "external",
      url: "https://e.com",
      target_id: null,
    });
  });

  it("keeps target_id + nulls url for entity links, recursing children", () => {
    const tree = [
      node(
        "x",
        [node("y", [], { link_type: "page", target_id: "p1", url: "/junk" })],
        {
          link_type: "article",
          target_id: "a1",
          url: "/junk",
        },
      ),
    ];
    const out = toItemsInput(tree)[0];
    expect(out).toMatchObject({
      link_type: "article",
      target_id: "a1",
      url: null,
    });
    expect(out.children[0]).toMatchObject({ target_id: "p1", url: null });
  });
});

describe("treesEqual", () => {
  it("ignores client keys (content/order/nesting only)", () => {
    // Same content (label/url), different keys → equal (keys are stripped).
    const mk = (k: string) =>
      node(k, [node(`${k}-c`, [], { label: "Child", url: "/child" })], {
        label: "Root",
        url: "/root",
      });
    expect(treesEqual([mk("k1")], [mk("server-1")])).toBe(true);
  });

  it("detects reordering + edits", () => {
    const base = [node("a"), node("b")];
    expect(treesEqual(base, [node("b"), node("a")])).toBe(false);
    expect(
      treesEqual(base, [node("a", [], { label: "changed" }), node("b")]),
    ).toBe(false);
  });
});

describe("getDescendantKeys / removeDescendants", () => {
  it("collects the contiguous deeper run after a node", () => {
    const rows = flattenTree([
      node("a", [node("a1", [node("a2")])]),
      node("b"),
    ]);
    expect([...getDescendantKeys(rows, "a")]).toEqual(["a1", "a2"]);
    expect(removeDescendants(rows, "a").map((r) => r.key)).toEqual(["a", "b"]);
  });
});

describe("getProjection", () => {
  it("reorders to the front (depth 0, no parent)", () => {
    const rows = [flat("a", null, 0), flat("b", null, 0)];
    expect(getProjection(rows, "b", "a", 0)).toEqual({
      depth: 0,
      parentKey: null,
    });
  });

  it("nests under the previous row when dragged right", () => {
    const rows = [flat("a", null, 0), flat("b", null, 0), flat("c", null, 0)];
    // Drag c over b with a +1 level offset → child of a (the row above the slot).
    expect(getProjection(rows, "c", "b", 20)).toEqual({
      depth: 1,
      parentKey: "a",
    });
  });
});

describe("applyDrop", () => {
  it("nests a root node under a sibling", () => {
    const tree = [node("a"), node("b")];
    const cloned = [flat("b", null, 0), flat("a", null, 0)];
    const next = applyDrop(tree, cloned, "b", "a");
    expect(next.map((n) => n.key)).toEqual(["a"]);
    expect(next[0].children.map((n) => n.key)).toEqual(["b"]);
  });

  it("reorders roots", () => {
    const tree = [node("a"), node("b")];
    const cloned = [flat("b", null, 0), flat("a", null, 0)];
    const next = applyDrop(tree, cloned, "b", null);
    expect(next.map((n) => n.key)).toEqual(["b", "a"]);
  });

  it("moves a subtree intact without creating a cycle", () => {
    const tree = [node("a", [node("a1")]), node("b")];
    const cloned = [flat("b", null, 0), flat("a", null, 0)];
    const next = applyDrop(tree, cloned, "a", "b");
    // a (with a1) now lives under b.
    expect(next.map((n) => n.key)).toEqual(["b"]);
    const moved = findNode(next, "a");
    expect(moved?.children.map((n) => n.key)).toEqual(["a1"]);
  });
});

describe("appendNode / updateNode / removeNode", () => {
  it("appends at root", () => {
    expect(appendNode([node("a")], node("b")).map((n) => n.key)).toEqual([
      "a",
      "b",
    ]);
  });

  it("updates a nested node's fields by key", () => {
    const tree = [node("a", [node("a1")])];
    const next = updateNode(tree, "a1", { label: "renamed" });
    expect(findNode(next, "a1")?.label).toBe("renamed");
  });

  it("removes a node and its subtree", () => {
    const tree = [node("a", [node("a1")]), node("b")];
    const next = removeNode(tree, "a");
    expect(next.map((n) => n.key)).toEqual(["b"]);
    expect(findNode(next, "a1")).toBeUndefined();
  });
});

describe("fromNodes", () => {
  it("hydrates server nodes into drafts keyed by id", () => {
    const server: MenuItemNode[] = [
      {
        id: "s1",
        label: "Home",
        link_type: "internal",
        target_id: null,
        url: "/",
        open_new_tab: false,
        sort_order: 0,
        children: [],
      },
    ];
    const draft = fromNodes(server);
    expect(draft[0].key).toBe("s1");
    expect(draft[0].label).toBe("Home");
  });
});
