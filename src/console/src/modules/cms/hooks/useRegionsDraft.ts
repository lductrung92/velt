import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { defaultConfig } from "../components/widgetCatalog";
import {
  applyDrop,
  changedSlots,
  emptyDraft,
  findBlock,
  fromDetails,
  resolveSlot,
  slotKey,
  splitSlotKey,
  type BlockDraft,
  type RegionsDraft,
} from "../utils/regionBlocks";

import type { WidgetConfig } from "../components/widgetCatalog";
import type {
  Group,
  RegionGroupDetail,
  Slot,
} from "../services/regions.service";

// Owns the editable board of every (group, slot) list. Hydrated once from the server list and
// again after a save (`rebase`); everything else edits locally until the caller
// persists. Same contract as useMenuDraft, so the save bar behaves identically.
export function useRegionsDraft(details: RegionGroupDetail[] | undefined) {
  const [draft, setDraft] = useState<RegionsDraft>(emptyDraft);
  const [baseline, setBaseline] = useState<RegionsDraft>(emptyDraft);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Only the first payload seeds the board: a background refetch must not throw
  // away blocks the reader has dragged but not saved.
  useEffect(() => {
    if (!details || hydrated.current) return;
    hydrated.current = true;
    const next = fromDetails(details);
    setDraft(next);
    setBaseline(next);
  }, [details]);

  const changed = useMemo(
    () => changedSlots(draft, baseline),
    [draft, baseline],
  );
  const dirty = changed.length > 0;

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const at = findBlock(draft, selectedKey);
    return at ? draft[at.at][at.index] : null;
  }, [draft, selectedKey]);

  const patch = useCallback((key: string, fields: Partial<BlockDraft>) => {
    setDraft((prev) => {
      const at = findBlock(prev, key);
      if (!at) return prev;
      const list = [...prev[at.at]];
      list[at.index] = { ...list[at.index], ...fields };
      return { ...prev, [at.at]: list };
    });
  }, []);

  /**
   * Copies what a group is inheriting into the group itself.
   *
   * The copies are new rows — fresh keys, no id — because they belong to this
   * group now, not to the ancestor they were read from. Sharing the ids would
   * make a later save move the ancestor's rows.
   */
  const seedFromAncestor = useCallback(
    (prev: RegionsDraft, group: Group, slot: Slot): RegionsDraft => {
      const at = slotKey(group, slot);
      if ((prev[at] ?? []).length > 0) return prev;
      const shown = resolveSlot(prev, details ?? [], group, slot);
      if (!shown.from || shown.from === group) return prev;
      return {
        ...prev,
        [at]: shown.blocks.map((b, i) => ({
          ...b,
          key: `copy-${at}-${i}-${Date.now()}`,
          id: null,
        })),
      };
    },
    [details],
  );

  const override = useCallback(
    (group: Group, slot: Slot) =>
      setDraft((prev) => seedFromAncestor(prev, group, slot)),
    [seedFromAncestor],
  );

  /** Hands the slot back to whatever the parent says. */
  const useInherited = useCallback((group: Group, slot: Slot) => {
    setDraft((prev) => ({ ...prev, [slotKey(group, slot)]: [] }));
    setSelectedKey(null);
  }, []);

  const drop = useCallback(
    (activeId: string, overId: string) => {
      // Dropping onto a slot that is only inheriting means "I want this one
      // too", not "throw the inherited ones away" — so the parent's list comes
      // down first and the new block joins it.
      let base = draft;
      if (overId.startsWith("slot:")) {
        const { group, slot } = splitSlotKey(overId.slice(5));
        base = seedFromAncestor(draft, group, slot);
      }
      const res = applyDrop(base, activeId, overId, defaultConfig);
      if (!res) return;
      setDraft(res.next);
      // Landing a block does NOT open its settings. It used to, which made
      // adding three blocks in a row impossible: the dialog swallowed the
      // next click. The pencil on the row is how settings are opened.
    },
    [draft, seedFromAncestor],
  );

  const remove = useCallback((key: string) => {
    setDraft((prev) => {
      const at = findBlock(prev, key);
      if (!at) return prev;
      return {
        ...prev,
        [at.at]: prev[at.at].filter((b) => b.key !== key),
      };
    });
    setSelectedKey((cur) => (cur === key ? null : cur));
  }, []);

  const reset = useCallback(() => {
    setDraft(baseline);
    setSelectedKey(null);
  }, [baseline]);

  const rebase = useCallback((next: RegionGroupDetail[]) => {
    const rebased = fromDetails(next);
    setDraft(rebased);
    setBaseline(rebased);
    setSelectedKey(null);
  }, []);

  return {
    draft,
    dirty,
    changed,
    selected,
    selectedKey,
    select: setSelectedKey,
    drop,
    remove,
    override,
    useInherited,
    reset,
    rebase,
    toggleVisible: (key: string, is_visible: boolean) =>
      patch(key, { is_visible }),
    setConfig: (key: string, config: WidgetConfig) => patch(key, { config }),
  };
}
