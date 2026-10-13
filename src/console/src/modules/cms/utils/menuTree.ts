import { arrayMove } from "@dnd-kit/sortable";

import type {
  MenuItemInput,
  MenuItemNode,
  MenuLinkType,
} from "../services/menus.service";

// Pure tree helpers for the menu builder (no React, no DOM) so the drag
// projection + reorder geometry stays unit-testable on its own.
//
// Unlike the category tree (which PATCHes one node per drop), the menu item tree
// has NO per-item endpoint: the whole tree is edited as local `MenuItemDraft`
// state and persisted in one `PUT /menus/{id}/items` replace. So these helpers
// produce the *next draft tree*, never a set of API patches.

// Horizontal step (px) per nesting level — matches each row's `depth * 1.25rem`
// indent (1.25rem @ 16px root = 20px). Translates a drag's horizontal offset
// into a target depth (reparent).
export const INDENT_WIDTH = 20;

// A draft menu item. `key` is a client-stable handle for selection + drag (the
// server `id` when hydrated, a `tmp-N` for items added in this session). The PUT
// body strips it — the backend recreates the tree.
export interface MenuItemDraft {
  key: string;
  label: string;
  description: string | null;
  link_type: MenuLinkType;
  target_id: string | null;
  url: string | null;
  open_new_tab: boolean;
  children: MenuItemDraft[];
}

// A draft node flattened to a row, carrying the structural data the drag
// projection needs.
export interface FlatMenuItem {
  key: string;
  parentKey: string | null;
  depth: number;
  label: string;
  link_type: MenuLinkType;
  hasChildren: boolean;
}

let counter = 0;
// Monotonic client key for a new item. Never collides with server UUIDs.
export function newItemKey(): string {
  return `tmp-${++counter}`;
}

// Hydrate the server tree into a draft (key = server id).
export function fromNodes(nodes: MenuItemNode[]): MenuItemDraft[] {
  return nodes.map((n) => ({
    key: n.id,
    label: n.label,
    description: n.description,
    link_type: n.link_type,
    target_id: n.target_id,
    url: n.url,
    open_new_tab: n.open_new_tab,
    children: fromNodes(n.children),
  }));
}

// Serialise the draft to the PUT body, dropping client keys and normalising the
// target/url pair per link_type (internal/external → url; entity → target_id).
export function toItemsInput(drafts: MenuItemDraft[]): MenuItemInput[] {
  return drafts.map((d) => {
    const isEntity =
      d.link_type === "article" ||
      d.link_type === "page" ||
      d.link_type === "category";
    return {
      // A server id travels back; a `tmp-` key is this session's invention and
      // must not, or the backend would try to keep a row that never existed.
      ...(d.key.startsWith("tmp-") ? {} : { id: d.key }),
      label: d.label,
      description: d.description,
      link_type: d.link_type,
      target_id: isEntity ? d.target_id : null,
      url: isEntity ? null : d.url,
      open_new_tab: d.open_new_tab,
      children: toItemsInput(d.children),
    };
  });
}

// Content fingerprint (ignores identity) — two trees are equal iff every node's
// content + order + nesting match. Used for the dirty check, which asks "is
// there anything to write", not "are these the same rows": the `id` the PUT
// body carries is identity, so it is dropped here.
export function serializeTree(drafts: MenuItemDraft[]): string {
  return JSON.stringify(toItemsInput(drafts), (key, value) =>
    key === "id" ? undefined : value,
  );
}

export function treesEqual(a: MenuItemDraft[], b: MenuItemDraft[]): boolean {
  return serializeTree(a) === serializeTree(b);
}

// Pre-order flatten (parent before children), preserving each level's order.
export function flattenTree(
  tree: MenuItemDraft[],
  depth = 0,
  parentKey: string | null = null,
): FlatMenuItem[] {
  return tree.flatMap((node) => [
    {
      key: node.key,
      parentKey,
      depth,
      label: node.label,
      link_type: node.link_type,
      hasChildren: node.children.length > 0,
    },
    ...flattenTree(node.children, depth + 1, node.key),
  ]);
}

// Keys of every descendant of `key` (pre-order ⇒ descendants are the contiguous
// run after it with a deeper depth). Used to lift a subtree out while its root
// is dragged, so a node can't be dropped inside itself.
export function getDescendantKeys(
  items: FlatMenuItem[],
  key: string,
): Set<string> {
  const result = new Set<string>();
  const idx = items.findIndex((i) => i.key === key);
  if (idx === -1) return result;
  const baseDepth = items[idx].depth;
  for (let i = idx + 1; i < items.length; i++) {
    if (items[i].depth <= baseDepth) break;
    result.add(items[i].key);
  }
  return result;
}

export function removeDescendants(
  items: FlatMenuItem[],
  key: string,
): FlatMenuItem[] {
  const descendants = getDescendantKeys(items, key);
  return items.filter((i) => !descendants.has(i.key));
}

function getDragDepth(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth);
}

// Project a drag (active dropped over `overKey`, shifted `dragOffset` px
// horizontally) onto a target depth + parentKey. Adapted from the dnd-kit
// sortable-tree recipe: depth is clamped between the row above (can become its
// child) and the row below (must not be shallower than it).
export function getProjection(
  items: FlatMenuItem[],
  activeKey: string,
  overKey: string,
  dragOffset: number,
  indentationWidth: number = INDENT_WIDTH,
): { depth: number; parentKey: string | null } {
  const overItemIndex = items.findIndex((i) => i.key === overKey);
  const activeItemIndex = items.findIndex((i) => i.key === activeKey);
  const activeItem = items[activeItemIndex];
  if (!activeItem || overItemIndex === -1) return { depth: 0, parentKey: null };

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

  return { depth, parentKey: getParentKey() };

  function getParentKey(): string | null {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentKey;
    if (depth > previousItem.depth) return previousItem.key;
    const parent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentKey;
    return parent ?? null;
  }
}

function cloneNode(node: MenuItemDraft): MenuItemDraft {
  return { ...node, children: node.children.map(cloneNode) };
}

function cloneTree(tree: MenuItemDraft[]): MenuItemDraft[] {
  return tree.map(cloneNode);
}

// Remove `key` from wherever it lives and return the detached node (subtree
// intact). Mutates `nodes` in place.
function detach(nodes: MenuItemDraft[], key: string): MenuItemDraft | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].key === key) return nodes.splice(i, 1)[0];
    const found = detach(nodes[i].children, key);
    if (found) return found;
  }
  return null;
}

export function findNode(
  tree: MenuItemDraft[],
  key: string,
): MenuItemDraft | undefined {
  for (const node of tree) {
    if (node.key === key) return node;
    const found = findNode(node.children, key);
    if (found) return found;
  }
  return undefined;
}

// Apply a drop: re-parent `activeKey` under `newParentKey` and order it within
// that sibling group per the post-drag flat order. Returns the next draft tree.
// `clonedFlat` is the flat list (with active's subtree already lifted out and
// arrayMove'd) used only to derive the target sibling order.
export function applyDrop(
  tree: MenuItemDraft[],
  clonedFlat: FlatMenuItem[],
  activeKey: string,
  newParentKey: string | null,
): MenuItemDraft[] {
  const siblingKeys = clonedFlat
    .filter(
      (i) =>
        (i.key === activeKey ? newParentKey : i.parentKey) === newParentKey,
    )
    .map((i) => i.key);

  const roots = cloneTree(tree);
  const active = detach(roots, activeKey);
  if (!active) return tree;

  const container = newParentKey
    ? findNode(roots, newParentKey)?.children
    : roots;
  if (!container) return tree;

  container.push(active);
  container.sort(
    (a, b) => siblingKeys.indexOf(a.key) - siblingKeys.indexOf(b.key),
  );
  return roots;
}

// Append a new node at root level (deepest nesting is done by dragging).
export function appendNode(
  tree: MenuItemDraft[],
  node: MenuItemDraft,
): MenuItemDraft[] {
  return [...cloneTree(tree), node];
}

// Patch a node's own fields (not children) by key.
export function updateNode(
  tree: MenuItemDraft[],
  key: string,
  patch: Partial<Omit<MenuItemDraft, "key" | "children">>,
): MenuItemDraft[] {
  return tree.map((node) =>
    node.key === key
      ? { ...node, ...patch }
      : { ...node, children: updateNode(node.children, key, patch) },
  );
}

// Remove a node (and its subtree) by key.
export function removeNode(
  tree: MenuItemDraft[],
  key: string,
): MenuItemDraft[] {
  return tree
    .filter((node) => node.key !== key)
    .map((node) => ({ ...node, children: removeNode(node.children, key) }));
}
