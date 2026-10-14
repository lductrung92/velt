import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { WIDGET_TYPES } from "./widgetCatalog";
import { paletteMenuId, paletteWidgetId } from "../utils/regionBlocks";

import type { MenuSlot } from "../services/menus.service";

function PaletteItem({ id, label }: { id: string; label: string }) {
  // No transform is applied: the source stays in the palette and the floating
  // preview is the board's <DragOverlay>, so the list never gains a hole.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { label },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="cms-palette-item"
      className={cn(
        "flex w-full cursor-grab touch-none items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Left column: the source of new blocks. Nothing here is a real block — a drag
// out of it CREATES one in whichever region it lands on.
export function BlockPalette({ menus }: { menus: MenuSlot[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("cms.appearance.palette.widgets")}
          </h2>
          <div className="space-y-1.5">
            {WIDGET_TYPES.map((type) => (
              <PaletteItem
                key={type}
                id={paletteWidgetId(type)}
                label={t(`cms.pages.widget.${type}.name`)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("cms.appearance.palette.menus")}
          </h2>
          {menus.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("cms.appearance.palette.no_menus")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {menus.map((menu) => (
                <PaletteItem
                  key={menu.id}
                  id={paletteMenuId(menu.id)}
                  label={menu.name}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
