import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  CornerUpLeft,
  Eye,
  EyeOff,
  GripVertical,
  Layers3,
  Link2,
  Menu,
  PanelBottom,
  PanelLeft,
  PanelTop,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { RowAction, RowActions } from "@/components/common/RowActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  blockWarning,
  blockLabel,
  slotDroppableId,
  slotKey,
} from "../utils/regionBlocks";

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
  const warning = blockWarning(block);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="cms-region-block"
      className={cn(
        "appearance-block",
        selected && "is-selected",
        isDragging && "opacity-50",
        !block.is_visible && "is-hidden",
        warning && `is-${warning}`,
      )}
    >
      <button
        type="button"
        aria-label={t("cms.appearance.reorder")}
        className="appearance-block-grip"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="appearance-block-icon">
        {block.kind === "menu" ? (
          <Menu className="size-4" />
        ) : (
          <Layers3 className="size-4" />
        )}
      </span>
      {/* Not a control. A whole row that silently opens a dialog gives a
          reader nothing to aim at and nothing to avoid; the pencil does it. */}
      <span className="appearance-block-name">
        <span>{label}</span>
        <small>
          {t(
            block.kind === "menu"
              ? "cms.appearance.palette.menus"
              : "cms.appearance.palette.widgets",
          )}
        </small>
      </span>
      <RowActions className="shrink-0">
        {/* A menu block has nothing to set: which menu it is IS the block, and
            swapping that is dropping the one you meant in its place. */}
        {block.kind === "widget" && (
          <RowAction
            icon={Pencil}
            label={t("cms.appearance.edit", { label })}
            onClick={onSelect}
          />
        )}
        <RowAction
          icon={block.is_visible ? Eye : EyeOff}
          pressed={block.is_visible}
          label={
            block.is_visible
              ? t("cms.appearance.hide", { label })
              : t("cms.appearance.show", { label })
          }
          onClick={onToggleVisible}
        />
        <RowAction
          destructive
          icon={Trash2}
          label={t("cms.appearance.remove", { label })}
          onClick={onRemove}
        />
      </RowActions>
      {warning && (
        <p className="appearance-block-warning">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {t(
            block.kind === "menu"
              ? "cms.appearance.blank_menu"
              : "cms.appearance.blank_widget",
          )}
        </p>
      )}
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
  targeted,
  onTarget,
  chrome,
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
  targeted: boolean;
  onTarget: () => void;
  /**
   * Set for a child group's header and footer: the switch that says whether
   * this group writes its own. Off folds the card to its title row — nine
   * groups each showing a read-only copy of the same two lists was most of the
   * board repeating itself.
   */
  chrome?: { on: boolean; onToggle: (next: boolean) => void };
}) {
  const { t } = useTranslation();
  const at = slotKey(group, slot);
  // The whole body is the drop zone, so a drop into the gap under the last row
  // appends rather than missing the slot entirely.
  const { setNodeRef, isOver } = useDroppable({ id: slotDroppableId(at) });
  // A chrome slot that is on is custom by definition, so it never reads as
  // inherited: the switch is the one place that choice is made.
  const inheriting = !chrome && own.length === 0 && shown.from !== null;
  const blocks = inheriting ? shown.blocks : own;
  const SlotIcon =
    slot === "header" ? PanelTop : slot === "footer" ? PanelBottom : PanelLeft;

  return (
    <Card
      data-testid={`cms-slot-${at}`}
      className={cn("appearance-slot", targeted && "is-targeted")}
    >
      {/* The whole strip picks the region, not just the few characters of its
          name: that was the hit area, and everyone aimed at the card. The
          button stretches over the strip rather than wrapping it, so the
          badges stay readable and there is still exactly one control. */}
      <div className="appearance-slot-header">
        <h3>
          <button
            type="button"
            className="appearance-slot-pick"
            aria-label={t("cms.appearance.ui.select_region", {
              slot: t(`cms.appearance.slot.${slot}`),
            })}
            aria-pressed={targeted}
            onClick={onTarget}
          >
            <SlotIcon className="size-4" />
            {t(`cms.appearance.slot.${slot}`)}
          </button>
        </h3>
        <div className="appearance-slot-badges">
          {targeted && (
            <span className="appearance-target-badge">
              {t("cms.appearance.ui.targeted")}
            </span>
          )}
          {inheriting && shown.from && (
            <span className="appearance-inherited-badge">
              <Link2 className="size-3.5" />
              {t("cms.appearance.inherited_from", {
                group: t(`cms.appearance.group.${shown.from}`),
              })}
            </span>
          )}
          {chrome && !chrome.on ? (
            <span className="appearance-chrome-state">
              {t("cms.appearance.ui.chrome_inherited")}
            </span>
          ) : (
            <span className="appearance-count-badge">
              {blocks.length === 0
                ? t("cms.appearance.count_empty")
                : t("cms.appearance.count", { n: blocks.length })}
            </span>
          )}
          {chrome && (
            <Switch
              checked={chrome.on}
              aria-label={t("cms.appearance.ui.chrome_toggle", {
                slot: t(`cms.appearance.slot.${slot}`),
              })}
              onCheckedChange={chrome.onToggle}
            />
          )}
        </div>
      </div>
      {chrome && !chrome.on ? null : (
        <CardContent
          ref={setNodeRef}
          className={cn("appearance-slot-body", isOver && "is-over")}
        >
          {inheriting ? (
            // Read-only on purpose: editing here would quietly turn an inherited
            // list into this group's own copy, and nothing on screen would say
            // the two had parted ways.
            <div className="space-y-2">
              <div className="space-y-2" aria-disabled>
                {blocks.map((block) => (
                  <div key={block.key} className="appearance-inherited-block">
                    <Link2 className="size-4" />
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
                <button
                  type="button"
                  className="appearance-slot-empty"
                  onClick={onTarget}
                  aria-label={t("cms.appearance.ui.select_region", {
                    slot: t(`cms.appearance.slot.${slot}`),
                  })}
                >
                  <span className="appearance-empty-stack" aria-hidden="true">
                    <span />
                    <span />
                    <Plus className="size-5" />
                  </span>
                  <span>{t("cms.appearance.drop_here")}</span>
                  <small>{t("cms.appearance.ui.drop_hint")}</small>
                </button>
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
              {own.length > 0 && group !== "common" && !chrome && (
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
      )}
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
  targetSlot,
  onTargetSlot,
  chromeSlots,
  isChromeOn,
  onChromeToggle,
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
  targetSlot?: Slot;
  onTargetSlot: (slot: Slot) => void;
  /** Slots this group folds behind a switch; empty for the root group. */
  chromeSlots: Slot[];
  isChromeOn: (slot: Slot) => boolean;
  onChromeToggle: (slot: Slot, next: boolean) => void;
}) {
  const slots = groups.find((g) => g.group === group)?.slots ?? [];
  return (
    <div className="appearance-regions">
      {slots.map(({ slot }) => (
        <SlotCard
          key={slot}
          group={group}
          slot={slot}
          own={draft[slotKey(group, slot)] ?? []}
          shown={resolveSlot(draft, groups, group, slot)}
          menus={menus}
          selectedKey={selectedKey}
          onSelect={(key) => {
            onTargetSlot(slot);
            onSelect(key);
          }}
          onToggleVisible={onToggleVisible}
          onRemove={onRemove}
          onOverride={() => onOverride(group, slot)}
          onUseInherited={() => onUseInherited(group, slot)}
          targeted={slot === targetSlot}
          onTarget={() => onTargetSlot(slot)}
          chrome={
            chromeSlots.includes(slot)
              ? {
                  on: isChromeOn(slot),
                  onToggle: (next: boolean) => onChromeToggle(slot, next),
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
