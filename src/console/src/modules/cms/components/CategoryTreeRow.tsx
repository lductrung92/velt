import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import { INDENT_WIDTH, type FlatCategory } from "../utils/categoryTree";

// One row of the category tree. Indents by `depth` (overridable so the dragged
// row previews where it will land) and exposes a drag handle as the sort
// activator — only when the user can manage the taxonomy (editors are read-only).
export function CategoryTreeRow({
  node,
  depth,
  canManage,
  reorderable = true,
  onEdit,
  onDelete,
}: {
  node: FlatCategory;
  depth: number;
  canManage: boolean;
  /** Show the drag handle. Off while the tree is filtered/sorted (a flat view
   *  where reordering by sort_order is meaningless). */
  reorderable?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : undefined}
    >
      <TableCell className="font-medium">
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: depth * INDENT_WIDTH }}
        >
          {canManage && reorderable && (
            <button
              type="button"
              aria-label={t("cms.categories.reorder")}
              title={t("cms.categories.reorder")}
              className="cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <span>{node.name}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {node.slug}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {node.articleCount}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {node.sortOrder}
      </TableCell>
      <TableCell className="text-right">
        {canManage && (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("common.edit")}
              title={t("common.edit")}
              onClick={() => onEdit(node.id)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("common.delete")}
              title={t("common.delete")}
              onClick={() => onDelete(node.id)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
