import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CornerUpLeft, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { blockLabel, slotDroppableId, slotKey } from "../utils/regionBlocks";

import type { MenuSlot } from "../services/menus.service";
import type {
  Group,
  RegionGroupDetail,
  Slot,
} from "../services/regions.service";
import type { BlockDraft, RegionsDraft } from "../utils/regionBlocks";
import { resolveSlot } from "../utils/regionBlocks";

function BlockRow({
  block,
  label,
  selected,
  onSelect,
  onToggleVisible,
  onRemove,
}: {
  block: BlockDraft;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.key, data: { label } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="cms-region-block"
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5",
        selected && "border-primary ring-1 ring-primary",
        isDragging && "opacity-50",
        !block.is_visible && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-label={t("cms.appearance.reorder")}
        className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          block.is_visible
            ? t("cms.appearance.hide", { label })
            : t("cms.appearance.show", { label })
        }
        aria-pressed={block.is_visible}
        onClick={onToggleVisible}
      >
        {block.is_visible ? (
          <Eye className="size-4" />
        ) : (
          <EyeOff className="size-4 text-muted-foreground" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("cms.appearance.remove", { label })}
        onClick={onRemove}
      >
        <Trash2 className="size-4 text-destructive-ink" />
      </Button>
    </div>
  );
}

function SlotCard({
  group,
  slot,
  own,
  shown,
  menus,
  selectedKey,
  onSelect,
  onToggleVisible,
  onRemove,
  onOverride,
  onUseInherited,
}: {
  group: Group;
  slot: Slot;
  /** What this group holds itself. Empty means it is inheriting. */
  own: BlockDraft[];
  /** What a page in this group actually shows, and which group supplied it. */
  shown: { blocks: BlockDraft[]; from: Group | null };
  menus: MenuSlot[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onToggleVisible: (key: string, next: boolean) => void;
  onRemove: (key: string) => void;
  onOverride: () => void;
  onUseInherited: () => void;
}) {
  const { t } = useTranslation();
  const at = slotKey(group, slot);
  // The whole body is the drop zone, so a drop into the gap under the last row
  // appends rather than missing the slot entirely.
  const { setNodeRef, isOver } = useDroppable({ id: slotDroppableId(at) });
  const inheriting = own.length === 0 && shown.from !== null;
  const blocks = inheriting ? shown.blocks : own;

  return (
    <Card data-testid={`cms-slot-${at}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t(`cms.appearance.slot.${slot}`)}</CardTitle>
          <div className="flex items-center gap-2">
            {inheriting && shown.from && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("cms.appearance.inherited_from", {
                  group: t(`cms.appearance.group.${shown.from}`),
                })}
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {blocks.length === 0
                ? t("cms.appearance.count_empty")
                : t("cms.appearance.count", { n: blocks.length })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={setNodeRef}
        className={cn("rounded-md", isOver && "bg-accent/40")}
      >
        {inheriting ? (
          // Read-only on purpose: editing here would quietly turn an inherited
          // list into this group's own copy, and nothing on screen would say
          // the two had parted ways.
          <div className="space-y-2">
            <div className="space-y-1.5 opacity-60" aria-disabled>
              {blocks.map((block) => (
                <div
                  key={block.key}
                  className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-sm"
                >
                  {blockLabel(block, menus, t)}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOverride}
            >
              {t("cms.appearance.override")}
            </Button>
          </div>
        ) : (
          <SortableContext
            items={own.map((b) => b.key)}
            strategy={verticalListSortingStrategy}
          >
            {own.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                {t("cms.appearance.drop_here")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {own.map((block) => (
                  <BlockRow
                    key={block.key}
                    block={block}
                    label={blockLabel(block, menus, t)}
                    selected={block.key === selectedKey}
                    onSelect={() => onSelect(block.key)}
                    onToggleVisible={() =>
                      onToggleVisible(block.key, !block.is_visible)
                    }
                    onRemove={() => onRemove(block.key)}
                  />
                ))}
              </div>
            )}
            {own.length > 0 && group !== "common" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 text-muted-foreground"
                onClick={onUseInherited}
              >
                <CornerUpLeft className="size-4" />
                {t("cms.appearance.use_inherited")}
              </Button>
            )}
          </SortableContext>
        )}
      </CardContent>
    </Card>
  );
}

// Centre column: every slot the selected page group can fill, stacked.
export function RegionBoard({
  draft,
  groups,
  group,
  menus,
  selectedKey,
  onSelect,
  onToggleVisible,
  onRemove,
  onOverride,
  onUseInherited,
}: {
  draft: RegionsDraft;
  groups: RegionGroupDetail[];
  group: Group;
  menus: MenuSlot[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onToggleVisible: (key: string, next: boolean) => void;
  onRemove: (key: string) => void;
  onOverride: (group: Group, slot: Slot) => void;
  onUseInherited: (group: Group, slot: Slot) => void;
}) {
  return (
    <div className="space-y-4">
      {(groups.find((g) => g.group === group)?.slots ?? []).map(({ slot }) => (
        <SlotCard
          key={slot}
          group={group}
          slot={slot}
          own={draft[slotKey(group, slot)] ?? []}
          shown={resolveSlot(draft, groups, group, slot)}
          menus={menus}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
          onRemove={onRemove}
          onOverride={() => onOverride(group, slot)}
          onUseInherited={() => onUseInherited(group, slot)}
        />
      ))}
    </div>
  );
}
