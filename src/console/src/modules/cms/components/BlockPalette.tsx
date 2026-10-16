import { useDraggable } from "@dnd-kit/core";
import {
  Blocks,
  Package,
  GripVertical,
  Layers3,
  Menu,
  Megaphone,
  Newspaper,
  Plus,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { REGION_WIDGET_TYPES, type WidgetType } from "./widgetCatalog";
import {
  acceptsWidgets,
  paletteMenuId,
  paletteWidgetId,
} from "../utils/regionBlocks";

import type { MenuSlot } from "../services/menus.service";
import type { Slot } from "../services/regions.service";

// Keyed by every type the catalogue offers, so adding one there and
// forgetting here is a compile error rather than a blank square.
const widgetIcons: Record<WidgetType, LucideIcon> = {
  product_grid: Package,
  articles_list: Newspaper,
  categories_showcase: Layers3,
  rich_text: Type,
  cta_banner: Megaphone,
};

function PaletteItem({
  id,
  label,
  icon: ItemIcon,
  onAdd,
  disabled,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  onAdd: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  // No transform is applied: the source stays in the palette and the floating
  // preview is the board's <DragOverlay>, so the list never gains a hole.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { label },
  });
  return (
    <div className={cn("appearance-palette-item", isDragging && "is-dragging")}>
      <button
        ref={setNodeRef}
        type="button"
        data-testid="cms-palette-item"
        className="appearance-palette-drag"
        {...attributes}
        {...listeners}
      >
        <span className="appearance-palette-icon">
          <ItemIcon className="size-4" />
        </span>
        <span>{label}</span>
        <GripVertical className="appearance-palette-grip size-3.5" />
      </button>
      <button
        type="button"
        className="appearance-palette-add"
        aria-label={t("cms.appearance.ui.add", { label })}
        title={t("cms.appearance.ui.add", { label })}
        onClick={onAdd}
        disabled={disabled}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// Left column: the source of new blocks. Nothing here is a real block — a drag
// out of it CREATES one in whichever region it lands on.
export function BlockPalette({
  menus,
  targetSlot,
  onAdd,
}: {
  menus: MenuSlot[];
  /** The region a + lands in; the board owns the choice. */
  targetSlot?: Slot;
  onAdd: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<"widgets" | "menus">("widgets");
  // Header and footer take menus only, so the library follows the board rather
  // than offering blocks a drop would refuse.
  const menusOnly = targetSlot ? !acceptsWidgets(targetSlot) : false;
  const tab = menusOnly ? "menus" : picked;
  const tabIcons = { widgets: Layers3, menus: Menu };

  return (
    <Card className="appearance-panel appearance-palette">
      <div className="appearance-panel-heading">
        <Blocks className="size-4" />
        <h2>{t("cms.appearance.ui.library")}</h2>
      </div>
      <p className="appearance-panel-caption">
        {t("cms.appearance.ui.palette_hint")}
      </p>
      {/* Where + adds, as a statement rather than a second control: the
          region is chosen by clicking its card, and two widgets setting the
          same value is two things to keep in step. */}
      <p className="appearance-target-line">
        {t("cms.appearance.ui.add_to")}
        <strong>
          {targetSlot
            ? t(`cms.appearance.slot.${targetSlot}`)
            : t("cms.appearance.ui.no_target")}
        </strong>
      </p>
      <div
        className="appearance-palette-tabs"
        role="tablist"
        aria-label={t("cms.appearance.ui.library")}
      >
        {(["widgets", "menus"] as const).map((value) => {
          const TabIcon = tabIcons[value];
          const locked = menusOnly && value === "widgets";
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`appearance-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`appearance-panel-${value}`}
              disabled={locked}
              title={locked ? t("cms.appearance.ui.menus_only") : undefined}
              onClick={() => setPicked(value)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "widgets"
                      : event.key === "End"
                        ? "menus"
                        : value === "widgets"
                          ? "menus"
                          : "widgets";
                  setPicked(next);
                  document.getElementById(`appearance-tab-${next}`)?.focus();
                }
              }}
              tabIndex={tab === value ? 0 : -1}
            >
              <TabIcon className="size-4" />
              {t(`cms.appearance.palette.${value}`)}
            </button>
          );
        })}
      </div>
      {menusOnly && (
        <p className="appearance-palette-note">
          {t("cms.appearance.ui.menus_only")}
        </p>
      )}
      <div
        className="appearance-palette-content"
        role="tabpanel"
        id={`appearance-panel-${tab}`}
        aria-labelledby={`appearance-tab-${tab}`}
      >
        {tab === "widgets" ? (
          <div className="space-y-2">
            {REGION_WIDGET_TYPES.map((type) => (
              <PaletteItem
                key={type}
                id={paletteWidgetId(type)}
                label={t(`cms.pages.widget.${type}.name`)}
                icon={widgetIcons[type]}
                onAdd={() => onAdd(paletteWidgetId(type))}
                disabled={!targetSlot}
              />
            ))}
          </div>
        ) : menus.length === 0 ? (
          <p className="appearance-palette-empty">
            {t("cms.appearance.palette.no_menus")}
          </p>
        ) : (
          <div className="space-y-1.5">
            {menus.map((menu) => (
              <PaletteItem
                key={menu.id}
                id={paletteMenuId(menu.id)}
                label={menu.name}
                icon={Menu}
                onAdd={() => onAdd(paletteMenuId(menu.id))}
                disabled={!targetSlot}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
