import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isEntityLink, type MenuItemFormValues } from "../schemas/menu";
import type { MenuDetail, MenuItemNode } from "../services/menus.service";
import {
  appendNode,
  applyDrop,
  findNode,
  fromNodes,
  newItemKey,
  removeNode,
  treesEqual,
  updateNode,
  type FlatMenuItem,
  type MenuItemDraft,
} from "../utils/menuTree";

export type MenuEditing =
  | { mode: "new" }
  | { mode: "edit"; key: string }
  | null;

function toNodeFields(
  values: MenuItemFormValues,
): Omit<MenuItemDraft, "key" | "children"> {
  const entity = isEntityLink(values.link_type);
  return {
    label: values.label.trim(),
    link_type: values.link_type,
    target_id: entity ? values.target_id : null,
    url: entity ? null : values.url.trim(),
    open_new_tab: values.open_new_tab,
  };
}

// Owns the local editable item tree (`draft`) for one menu slot. The draft is
// hydrated from the server detail on slot switch + after a save (`rebase`); all
// item edits/reorders mutate it locally until the caller persists via PUT.
export function useMenuDraft(detail: MenuDetail | undefined) {
  const [draft, setDraft] = useState<MenuItemDraft[]>([]);
  const baselineRef = useRef<MenuItemDraft[]>([]);
  const [editing, setEditing] = useState<MenuEditing>(null);
  const loadedId = useRef<string | null>(null);

  // Resync to the server tree when a different slot loads. Edits to the SAME
  // slot's draft are preserved across background refetches (only an id change or
  // an explicit rebase replaces the draft).
  useEffect(() => {
    if (!detail) {
      loadedId.current = null;
      baselineRef.current = [];
      setDraft([]);
      setEditing(null);
      return;
    }
    if (detail.id !== loadedId.current) {
      loadedId.current = detail.id;
      const items = fromNodes(detail.items);
      baselineRef.current = items;
      setDraft(items);
      setEditing(null);
    }
  }, [detail]);

  const dirty = useMemo(() => !treesEqual(draft, baselineRef.current), [draft]);

  const selectedNode = useMemo(
    () =>
      editing?.mode === "edit" ? (findNode(draft, editing.key) ?? null) : null,
    [editing, draft],
  );

  const startAdd = useCallback(() => setEditing({ mode: "new" }), []);
  const selectItem = useCallback(
    (key: string) => setEditing({ mode: "edit", key }),
    [],
  );
  const cancelEdit = useCallback(() => setEditing(null), []);

  const applyForm = useCallback(
    (values: MenuItemFormValues) => {
      const fields = toNodeFields(values);
      // Branch on `editing` OUTSIDE the state updaters: nesting setDraft (and
      // newItemKey) inside a setEditing updater made it impure, so StrictMode's
      // double-invocation appended the new item TWICE (duplicate bug).
      if (editing?.mode === "edit") {
        const key = editing.key;
        setDraft((d) => updateNode(d, key, fields));
        return;
      }
      const key = newItemKey();
      setDraft((d) => appendNode(d, { key, children: [], ...fields }));
      setEditing({ mode: "edit", key });
    },
    [editing],
  );

  const deleteItem = useCallback((key: string) => {
    setDraft((d) => removeNode(d, key));
    setEditing((cur) => (cur?.mode === "edit" && cur.key === key ? null : cur));
  }, []);

  const moveItem = useCallback(
    (clonedFlat: FlatMenuItem[], activeKey: string, parentKey: string | null) =>
      setDraft((d) => applyDrop(d, clonedFlat, activeKey, parentKey)),
    [],
  );

  const reset = useCallback(() => {
    setDraft(baselineRef.current);
    setEditing(null);
  }, []);

  const rebase = useCallback((items: MenuItemNode[]) => {
    const d = fromNodes(items);
    baselineRef.current = d;
    setDraft(d);
    setEditing(null);
  }, []);

  return {
    draft,
    dirty,
    editing,
    selectedNode,
    startAdd,
    selectItem,
    cancelEdit,
    applyForm,
    deleteItem,
    moveItem,
    reset,
    rebase,
  };
}
