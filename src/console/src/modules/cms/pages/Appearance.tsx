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
import { RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { EditorActionBar } from "@/components/common/EditorActionBar/EditorActionBar";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnsavedChanges } from "@/app/UnsavedChangesProvider";
import { parseApiError } from "@/utils/apiError";

import { BlockPalette } from "../components/BlockPalette";
import { BlockSettingsPane } from "../components/BlockSettingsPane";
import { GroupTree } from "../components/GroupTree";
import { RegionBoard } from "../components/RegionBoard";
import { cmsKeys } from "../hooks/cmsKeys";
import { useMenus } from "../hooks/useCmsMenus";
import { useRegions, useReplaceRegionBlocks } from "../hooks/useCmsRegions";
import { useRegionsDraft } from "../hooks/useRegionsDraft";
import type { Group, RegionBlock } from "../services/regions.service";
import { slotKey, splitSlotKey, toInput } from "../utils/regionBlocks";

export default function Appearance() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const regions = useRegions();
  const menus = useMenus();
  const draft = useRegionsDraft(regions.data);
  const save = useReplaceRegionBlocks();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("common");

  useUnsavedChanges({ when: draft.dirty, what: t("cms.appearance.one") });

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
    if (e.over) draft.drop(String(e.active.id), String(e.over.id));
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
      draft.rebase(merged);
      toast.success(t("cms.appearance.toast.saved"));
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("cms.appearance.title")}
        subtitle={t("cms.appearance.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_appearance" }]}
      />

      {draft.dirty && (
        <EditorActionBar>
          <Button
            type="button"
            variant="outline"
            onClick={draft.reset}
            disabled={save.isPending}
          >
            <RotateCcw className="size-4" />
            {t("common.reset")}
          </Button>
          <Button
            type="button"
            loading={save.isPending}
            onClick={() => void handleSave()}
          >
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </EditorActionBar>
      )}

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
          <div className="grid gap-4 xl:grid-cols-[240px_1fr_320px]">
            <div className="space-y-4">
              <GroupTree
                groups={regions.data ?? []}
                value={group}
                onChange={setGroup}
              />
              <BlockPalette menus={menus.data ?? []} />
            </div>
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
            />
            <BlockSettingsPane
              block={draft.selected}
              menus={menus.data ?? []}
              onConfigChange={(config) =>
                draft.selectedKey && draft.setConfig(draft.selectedKey, config)
              }
              onMenuChange={(menuId) =>
                draft.selectedKey && draft.setMenu(draft.selectedKey, menuId)
              }
            />
          </div>

          <DragOverlay>
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
