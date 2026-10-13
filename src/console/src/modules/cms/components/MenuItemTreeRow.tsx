import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { INDENT_WIDTH, type FlatMenuItem } from "../utils/menuTree";

// One node of the menu item tree. Indents by `depth` (overridable so the dragged
// row previews where it will land); the grip is the drag activator.
export function MenuItemTreeRow({
  node,
  depth,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  node: FlatMenuItem;
  depth: number;
  selected: boolean;
  onSelect: (key: string) => void;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.key });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    marginLeft: depth * INDENT_WIDTH,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm",
        selected && "border-primary bg-accent",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-label={t("cms.menus.item.reorder")}
        title={t("cms.menus.item.reorder")}
        className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:text-foreground"
        onClick={() => onSelect(node.key)}
      >
        {node.label}
      </button>

      <Badge variant="secondary">
        {t(`cms.menus.link_type.${node.link_type}`)}
      </Badge>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("common.actions")}
            title={t("common.actions")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(node.key)}>
            <Pencil className="size-4" />
            {t("common.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive-ink focus:text-destructive-ink"
            onClick={() => onDelete(node.key)}
          >
            <Trash2 className="size-4" />
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
