import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, Pencil, Trash2 } from "lucide-react";
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
      data-testid="cms-category-row"
      className={isDragging ? "opacity-50" : undefined}
    >
      <TableCell style={{ paddingLeft: 20 + depth * INDENT_WIDTH }}>
        <div className="category-name">
          {canManage && reorderable && (
            <button
              type="button"
              aria-label={t("cms.categories.reorder")}
              title={t("cms.categories.reorder")}
              className="category-grip"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          {depth > 0 && <span className="category-branch" aria-hidden />}
          <strong>{node.name}</strong>
        </div>
      </TableCell>
      <TableCell>
        <span className="category-slug">{node.slug}</span>
      </TableCell>
      <TableCell>
        <span
          className="category-count"
          data-empty={node.articleCount === 0 ? "true" : "false"}
        >
          <FileText className="size-3" aria-hidden />
          {t("cms.categories.article_count", { count: node.articleCount })}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <span className="category-order">{node.sortOrder}</span>
      </TableCell>
      <TableCell className="text-right">
        {canManage && (
          <div className="category-row-actions">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.edit")}
              title={t("common.edit")}
              onClick={() => onEdit(node.id)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("common.delete")}
              title={t("common.delete")}
              onClick={() => onDelete(node.id)}
            >
              <Trash2 className="size-4 text-destructive-ink" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
