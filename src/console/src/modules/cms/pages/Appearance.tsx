import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Layers3,
  LayoutTemplate,
  RotateCcw,
  Save,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseApiError } from "@/utils/apiError";

import { BlockPalette } from "../components/BlockPalette";
import { BlockSettingsPane } from "../components/BlockSettingsPane";
import { GroupTree } from "../components/GroupTree";
import { RegionBoard } from "../components/RegionBoard";
import { cmsKeys } from "../hooks/cmsKeys";
import { useMenus } from "../hooks/useCmsMenus";
import { useRegions, useReplaceRegionBlocks } from "../hooks/useCmsRegions";
import { useRegionsDraft } from "../hooks/useRegionsDraft";
import type { Group, RegionBlock, Slot } from "../services/regions.service";
import { translationService } from "@/modules/translation/services/translation.service";

import {
  CHROME_SLOTS,
  findBlock,
  pairSavedIDs,
  slotDroppableId,
  slotKey,
  splitSlotKey,
  toInput,
} from "../utils/regionBlocks";
import "./appearance.css";

export default function Appearance() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const regions = useRegions();
  const menus = useMenus();
  const draft = useRegionsDraft(regions.data);
  const save = useReplaceRegionBlocks();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("common");
  const [target, setTarget] = useState<Slot>("header");
  // Chrome slots a child group has opened but not filled yet. Without it a
  // switch turned on over an empty parent would spring straight back off,
  // because "owns no blocks" is also how inheriting looks.
  const [opened, setOpened] = useState<string[]>([]);
  // Translations typed in the settings dialog, by block key. A block added in
  // this session has no id to store them against until Save hands one out, so
  // they wait here and every block's goes the same way.
  const pendingTr = useRef<
    Record<string, Record<string, Record<string, unknown>>>
  >({});
  const all = (
    regions.data?.find((item) => item.group === group)?.slots ?? []
  ).map((item) => item.slot);
  // Chung is where the chrome is written; every other group folds it behind a
  // switch, and only opens a card once it is overriding.
  const chromeSlots =
    group === "common" ? [] : all.filter((slot) => CHROME_SLOTS.includes(slot));
  const isChromeOn = (slot: Slot) => {
    const at = slotKey(group, slot);
    return (draft.draft[at]?.length ?? 0) > 0 || opened.includes(at);
  };
  const toggleChrome = (slot: Slot, next: boolean) => {
    const at = slotKey(group, slot);
    setOpened((prev) =>
      next ? [...prev, at] : prev.filter((key) => key !== at),
    );
    if (next) draft.override(group, slot);
    else draft.useInherited(group, slot);
  };
  const slots = all.filter(
    (slot) => !chromeSlots.includes(slot) || isChromeOn(slot),
  );
  const targetSlot = slots.includes(target) ? target : slots[0];
  const changeGroup = (next: Group) => {
    setGroup(next);
    draft.select(null);
    setTarget("header");
  };
  const addBlock = (id: string) => {
    if (targetSlot) draft.drop(id, slotDroppableId(slotKey(group, targetSlot)));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(e: DragStartEvent) {
    // Each draggable carries its own label, so the overlay never has to guess
    // whether the id names a palette entry or a block already on the board.
    setDragLabel((e.active.data.current?.label as string) ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragLabel(null);
    if (e.over) {
      const over = String(e.over.id);
      const at = over.startsWith("slot:")
        ? over.slice(5)
        : findBlock(draft.draft, over)?.at;
      if (at) setTarget(splitSlotKey(at).slot);
      draft.drop(String(e.active.id), over);
      // Reordering an existing block should not interrupt with a settings modal.
      if (findBlock(draft.draft, String(e.active.id))) draft.select(null);
    }
  }

  async function handleSave() {
    try {
      // Only the slots that moved are PUT; an untouched slot keeps its rows and
      // their ids without a round trip.
      const saved = new Map<string, RegionBlock[]>();
      for (const at of draft.changed) {
        const { group: g, slot } = splitSlotKey(at);
        const detail = await save.mutateAsync({
          group: g,
          slot,
          blocks: toInput(draft.draft[at]),
        });
        saved.set(at, detail.blocks);
        // Only now does a block added in this session have an address, so the
        // other languages typed for it are written here.
        for (const [key, id] of pairSavedIDs(draft.draft[at], detail.blocks)) {
          for (const [locale, values] of Object.entries(
            pendingTr.current[key] ?? {},
          )) {
            await translationService.put("region_block", id, locale, values);
          }
        }
      }
      // Rebuild the whole list so the cache and the draft agree on every slot,
      // not only the saved ones.
      const previous = new Map<string, RegionBlock[]>();
      for (const g of regions.data ?? []) {
        for (const s of g.slots)
          previous.set(slotKey(g.group, s.slot), s.blocks);
      }
      // Rebuilt from the server's own group list, so the console never has to
      // know which slots a group has.
      const merged = (regions.data ?? []).map((g) => ({
        ...g,
        slots: g.slots.map(({ slot }) => {
          const at = slotKey(g.group, slot);
          return { slot, blocks: saved.get(at) ?? previous.get(at) ?? [] };
        }),
      }));
      qc.setQueryData(cmsKeys.regionList(), merged);
      pendingTr.current = {};
      draft.rebase(merged);
      toast.success(t("cms.appearance.toast.saved"));
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <div className="appearance space-y-4">
      <PageHeader
        title={t("cms.appearance.title")}
        subtitle={t("cms.appearance.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_appearance" }]}
      />

      <EditorActionBar
        left={
          <span
            className={`appearance-save-state${draft.dirty ? " is-dirty" : ""}`}
            role="status"
          >
            <CheckCircle2 className="size-4" />
            {draft.dirty
              ? t("cms.appearance.ui.unsaved", { n: draft.changed.length })
              : t("cms.appearance.ui.unchanged")}
          </span>
        }
      >
        <Button
          type="button"
          variant="outline"
          onClick={draft.reset}
          disabled={!draft.dirty || save.isPending}
        >
          <RotateCcw className="size-4" />
          {t("common.reset")}
        </Button>
        <Button
          type="button"
          loading={save.isPending}
          disabled={!draft.dirty || regions.isError}
          onClick={() => void handleSave()}
        >
          <Save className="size-4" />
          {t("common.save")}
        </Button>
      </EditorActionBar>

      {regions.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(regions.error, t).message}
        />
      ) : regions.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragLabel(null)}
        >
          <div className="appearance-workspace">
            <aside
              className="appearance-library"
              aria-label={t("cms.appearance.ui.library")}
            >
              <GroupTree
                groups={regions.data ?? []}
                value={group}
                onChange={changeGroup}
              />
              <BlockPalette
                menus={menus.data ?? []}
                targetSlot={targetSlot}
                onAdd={addBlock}
              />
            </aside>
            <section
              className="appearance-canvas"
              aria-labelledby="appearance-board-title"
            >
              <div className="appearance-canvas-header">
                <span className="appearance-heading-icon">
                  <LayoutTemplate className="size-5" />
                </span>
                <div>
                  <p>{t("cms.appearance.ui.layout")}</p>
                  <h2 id="appearance-board-title">
                    {t(`cms.appearance.group.${group}`)}
                  </h2>
                </div>
                <span className="appearance-slot-count">
                  {t("cms.appearance.ui.regions", { n: all.length })}
                </span>
              </div>
              <p className="appearance-board-hint">
                {t(
                  group === "common"
                    ? "cms.appearance.ui.common_hint"
                    : "cms.appearance.ui.group_hint",
                )}
              </p>
              <RegionBoard
                draft={draft.draft}
                groups={regions.data ?? []}
                group={group}
                menus={menus.data ?? []}
                selectedKey={draft.selectedKey}
                onSelect={draft.select}
                onToggleVisible={draft.toggleVisible}
                onRemove={draft.remove}
                onOverride={draft.override}
                onUseInherited={draft.useInherited}
                targetSlot={targetSlot}
                onTargetSlot={setTarget}
                chromeSlots={chromeSlots}
                isChromeOn={isChromeOn}
                onChromeToggle={toggleChrome}
              />
              <div className="appearance-board-note">
                <Layers3 className="size-4" />
                <span>{t("cms.appearance.ui.board_hint")}</span>
              </div>
            </section>
          </div>
          <BlockSettingsPane
            block={draft.selected}
            menus={menus.data ?? []}
            onClose={() => draft.select(null)}
            onConfigChange={(config) =>
              draft.selectedKey && draft.setConfig(draft.selectedKey, config)
            }
            onTranslations={(pending) => {
              if (draft.selectedKey && Object.keys(pending).length > 0)
                pendingTr.current[draft.selectedKey] = pending;
            }}
          />

          {/*
            * No fly-back.
            *
            * dnd-kit's default drop animation returns the overlay to the
            * element it was lifted from. Dropping a block from the library
            * does not MOVE that library entry — the entry stays where it is
            * and a copy appears in the slot — so the default read as "the
            * board refused it", which is exactly what it looked like
            * (bugs/console/image.png). Ending the drag where the pointer let
            * go, with the new block already drawn in the slot, is the whole
            * fix. A reorder needs no animation either: the list has already
            * re-rendered with the block in its new place.
            */}
          <DragOverlay dropAnimation={null}>
            {dragLabel && (
              <div className="rounded-md border bg-background px-2 py-1.5 text-sm shadow-md">
                {dragLabel}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
