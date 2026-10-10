import { arrayMove } from "@dnd-kit/sortable";
import { describe, expect, it } from "vitest";

import type { Category } from "../services/categories.service";
import {
  computeReorder,
  flattenTree,
  getDescendantIds,
  getProjection,
  removeDescendants,
} from "./categoryTree";

// Builder for a category node; sort_order/parent_id/children are the bits the
// reorder geometry cares about. updated_at is distinct per node so we can assert
// the optimistic-lock token rides along into each patch.
function cat(
  id: string,
  sort: number,
  parent: string | null,
  children: Category[] = [],
): Category {
  return {
    id,
    name: id.toUpperCase(),
    slug: id,
    parent_id: parent,
    description: null,
    sort_order: sort,
    article_count: 0,
    seo: {},
    children,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: `u-${id}`,
  };
}

// A1, A2 under A; B at root.
function makeTree(): Category[] {
  return [
    cat("a", 0, null, [cat("a1", 0, "a"), cat("a2", 1, "a")]),
    cat("b", 1, null),
  ];
}

// Mimic a full drop: flatten, lift the dragged subtree, project, arrayMove, then
// compute the patches + optimistic tree — exactly what the page does on dragEnd.
function drop(
  tree: Category[],
  activeId: string,
  overId: string,
  offset: number,
) {
  const flat = flattenTree(tree);
  const list = removeDescendants(flat, activeId);
  const a = list.findIndex((i) => i.id === activeId);
  const o = list.findIndex((i) => i.id === overId);
  const proj = getProjection(list, activeId, overId, offset);
  const cloned = arrayMove(list, a, o);
  return { proj, ...computeReorder(tree, cloned, activeId, proj.parentId) };
}

describe("flattenTree", () => {
  it("emits nodes pre-order with depth and parentId", () => {
    const flat = flattenTree(makeTree());
    expect(flat.map((n) => n.id)).toEqual(["a", "a1", "a2", "b"]);
    expect(flat.map((n) => n.depth)).toEqual([0, 1, 1, 0]);
    expect(flat.map((n) => n.parentId)).toEqual([null, "a", "a", null]);
    expect(flat[0].hasChildren).toBe(true);
    expect(flat[1].hasChildren).toBe(false);
  });
});

describe("getDescendantIds / removeDescendants", () => {
  it("collects the contiguous descendant run", () => {
    const flat = flattenTree(makeTree());
    expect([...getDescendantIds(flat, "a")]).toEqual(["a1", "a2"]);
    expect([...getDescendantIds(flat, "a1")]).toEqual([]);
    expect(removeDescendants(flat, "a").map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("computeReorder via drop()", () => {
  it("reorders siblings within the same parent (A2 above A1)", () => {
    const { proj, moves, tree } = drop(makeTree(), "a2", "a1", 0);
    expect(proj.parentId).toBe("a");
    // A2 → index 0, A1 → index 1; parent unchanged so no parent_id on the patches.
    expect(moves).toEqual(
      expect.arrayContaining([
        { id: "a2", sort_order: 0, updated_at: "u-a2" },
        { id: "a1", sort_order: 1, updated_at: "u-a1" },
      ]),
    );
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.parent_id === undefined)).toBe(true);
    // Optimistic tree reflects the new order.
    expect(tree[0].children.map((c) => c.id)).toEqual(["a2", "a1"]);
    expect(tree[0].children.map((c) => c.sort_order)).toEqual([0, 1]);
  });

  it("reparents a node to root when dragged left (A2 → root after B)", () => {
    const { proj, moves, tree } = drop(makeTree(), "a2", "b", -25);
    expect(proj.parentId).toBeNull();
    const a2 = moves.find((m) => m.id === "a2");
    expect(a2).toMatchObject({ parent_id: null, updated_at: "u-a2" });
    // A2 left A's subtree and now sits at root level.
    expect(tree.map((n) => n.id)).toContain("a2");
    expect(tree.find((n) => n.id === "a2")?.parent_id).toBeNull();
  });

  it("reparents a node under another (B → child of A)", () => {
    const { proj, moves, tree } = drop(makeTree(), "b", "a2", 20);
    expect(proj.parentId).toBe("a");
    const b = moves.find((m) => m.id === "b");
    expect(b).toMatchObject({ parent_id: "a", updated_at: "u-b" });
    // Root now has only A; B nested under A.
    expect(tree.map((n) => n.id)).toEqual(["a"]);
    expect(tree[0].children.map((c) => c.id)).toContain("b");
  });

  it("guards cycles: a parent's subtree is lifted out so it can't drop inside itself", () => {
    const flat = flattenTree(makeTree());
    // While A is dragged, A1/A2 are not droppable targets.
    const list = removeDescendants(flat, "a");
    expect(list.map((n) => n.id)).toEqual(["a", "b"]);
    expect(list.find((n) => n.id === "a1")).toBeUndefined();
  });
});
