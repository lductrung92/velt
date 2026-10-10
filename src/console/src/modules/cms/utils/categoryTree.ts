import { arrayMove } from "@dnd-kit/sortable";

import type { Category } from "../services/categories.service";

// Tree helpers for the drag-and-drop category reorder. Kept pure (no React, no
// DOM) so the projection/reorder geometry is unit-testable on its own. The
// backend has NO atomic reorder endpoint — a drop is expressed as one or more
// `PATCH /categories/{id}` calls (parent_id + sort_order), so `computeReorder`
// returns the minimal set of node patches plus the optimistic tree to render
// while they fly.

// Horizontal step (px) per nesting level — matches the row's `depth * 1.25rem`
// indent (1.25rem @ 16px root = 20px). Used to translate a drag's horizontal
// offset into a target depth (reparent).
export const INDENT_WIDTH = 20;

// A tree node flattened to a row, carrying display fields + the structural data
// (depth/parentId/sortOrder) the drag projection needs.
export interface FlatCategory {
  id: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  name: string;
  slug: string;
  articleCount: number;
  updatedAt: string;
  hasChildren: boolean;
}

// A single node patch emitted by a drop. `parent_id` is present only when the
// node actually changed parent (Optional semantics: omit = leave unchanged).
export interface ReorderMove {
  id: string;
  parent_id?: string | null;
  sort_order: number;
  updated_at: string;
}

export interface ReorderResult {
  moves: ReorderMove[];
  tree: Category[];
}

// Pre-order flatten (parent before children), preserving each level's order
// (the backend already sorts by sort_order, then name).
export function flattenTree(
  tree: Category[],
  depth = 0,
  parentId: string | null = null,
): FlatCategory[] {
  return tree.flatMap((node) => [
    {
      id: node.id,
      parentId,
      depth,
      sortOrder: node.sort_order,
      name: node.name,
      slug: node.slug,
      articleCount: node.article_count,
      updatedAt: node.updated_at,
      hasChildren: node.children.length > 0,
    },
    ...flattenTree(node.children, depth + 1, node.id),
  ]);
}

// Ids of every descendant of `id` (pre-order ⇒ descendants are the contiguous
// run after `id` with a deeper depth). Used to lift the whole subtree out of the
// list while its root is dragged, so a node can't be dropped inside itself.
export function getDescendantIds(
  items: FlatCategory[],
  id: string,
): Set<string> {
  const result = new Set<string>();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return result;
  const baseDepth = items[idx].depth;
  for (let i = idx + 1; i < items.length; i++) {
    if (items[i].depth <= baseDepth) break;
    result.add(items[i].id);
  }
  return result;
}

export function removeDescendants(
  items: FlatCategory[],
  id: string,
): FlatCategory[] {
  const descendants = getDescendantIds(items, id);
  return items.filter((i) => !descendants.has(i.id));
}

function getDragDepth(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth);
}

// Project a drag (active dropped over `overId`, shifted `dragOffset` px
// horizontally) onto a target depth + parentId. Adapted from the dnd-kit
// sortable-tree recipe: depth is clamped between the row above (can become its
// child) and the row below (must not be shallower than it).
export function getProjection(
  items: FlatCategory[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number = INDENT_WIDTH,
): { depth: number; parentId: string | null } {
  const overItemIndex = items.findIndex((i) => i.id === overId);
  const activeItemIndex = items.findIndex((i) => i.id === activeId);
  const activeItem = items[activeItemIndex];
  if (!activeItem || overItemIndex === -1) return { depth: 0, parentId: null };

  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const projectedDepth =
    activeItem.depth + getDragDepth(dragOffset, indentationWidth);
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  return { depth, parentId: getParentId() };

  function getParentId(): string | null {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    const parent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;
    return parent ?? null;
  }
}

function cloneCategory(node: Category): Category {
  return {
    ...node,
    seo: { ...node.seo },
    children: node.children.map(cloneCategory),
  };
}

// Remove `id` from wherever it lives in the tree and return the detached node
// (with its subtree intact). Mutates `nodes` in place.
function detach(nodes: Category[], id: string): Category | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0];
    const found = detach(nodes[i].children, id);
    if (found) return found;
  }
  return null;
}

function findNode(nodes: Category[], id: string): Category | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

// Locate a node anywhere in the tree (e.g. to open the edit dialog with the full
// node, including its optimistic-lock token and SEO).
export function findCategory(
  tree: Category[],
  id: string,
): Category | undefined {
  return findNode(tree, id);
}

function indexById(tree: Category[]): Map<string, Category> {
  const map = new Map<string, Category>();
  const walk = (nodes: Category[]) =>
    nodes.forEach((n) => {
      map.set(n.id, n);
      walk(n.children);
    });
  walk(tree);
  return map;
}

// Given the post-drag flat order (`clonedFlat` = the list with active's subtree
// lifted out and `arrayMove`d) and the projected `newParentId`, produce:
//   - `tree`: the optimistic tree (active subtree re-parented + the target
//     sibling group renumbered), to render immediately, and
//   - `moves`: the minimal `PATCH /categories/{id}` set (active's parent/sort +
//     any sibling whose sort_order shifted). Old-parent siblings keep their
//     relative order (gaps are fine — the backend orders by sort_order) so they
//     need no patch.
export function computeReorder(
  tree: Category[],
  clonedFlat: FlatCategory[],
  activeId: string,
  newParentId: string | null,
): ReorderResult {
  // New sibling order under the target parent, in the dropped visual order, with
  // active re-parented to newParentId.
  const siblingIds = clonedFlat
    .filter(
      (i) => (i.id === activeId ? newParentId : i.parentId) === newParentId,
    )
    .map((i) => i.id);

  const roots = tree.map(cloneCategory);
  const active = detach(roots, activeId);
  if (!active) return { moves: [], tree };
  active.parent_id = newParentId;

  const container = newParentId
    ? findNode(roots, newParentId)?.children
    : roots;
  if (!container) return { moves: [], tree };
  container.push(active);
  container.sort((a, b) => siblingIds.indexOf(a.id) - siblingIds.indexOf(b.id));
  container.forEach((node, idx) => (node.sort_order = idx));

  const origById = indexById(tree);
  const moves: ReorderMove[] = [];
  container.forEach((node, idx) => {
    const orig = origById.get(node.id);
    if (!orig) return;
    const parentChanged =
      node.id === activeId &&
      (orig.parent_id ?? null) !== (newParentId ?? null);
    const sortChanged = orig.sort_order !== idx;
    if (!parentChanged && !sortChanged) return;
    const move: ReorderMove = {
      id: node.id,
      sort_order: idx,
      updated_at: orig.updated_at,
    };
    if (parentChanged) move.parent_id = newParentId;
    moves.push(move);
  });

  return { moves, tree: roots };
}
