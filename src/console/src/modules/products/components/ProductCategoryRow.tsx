import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Package, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RowAction, RowActions } from "@/components/common/RowActions";
import { TableCell, TableRow } from "@/components/ui/table";

import type { ProductCategory } from "../services/productCategories.service";

// One row of the product taxonomy. Mirrors CategoryTreeRow minus the tree
// indent — this vocabulary is flat, so there is no depth to express.
export function ProductCategoryRow({
  category,
  canManage,
  reorderable = true,
  onEdit,
  onDelete,
}: {
  category: ProductCategory;
  canManage: boolean;
  /** Show the drag handle. Off while the list is filtered/sorted (reordering by
   *  sort_order is meaningless there). */
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
  } = useSortable({ id: category.id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-50" : undefined}
      data-testid="product-category-row"
    >
      <TableCell>
        <div className="pcat-name">
          {canManage && reorderable && (
            <button
              type="button"
              aria-label={t("products.categories.reorder")}
              title={t("products.categories.reorder")}
              className="pcat-grip"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <strong title={category.name}>{category.name}</strong>
        </div>
      </TableCell>
      <TableCell>
        <span className="pcat-slug" title={category.slug}>
          {category.slug}
        </span>
      </TableCell>
      <TableCell>
        <span
          className="pcat-count"
          data-empty={category.product_count === 0 ? "true" : "false"}
        >
          <Package className="size-3" aria-hidden />
          {t("products.categories.product_count", {
            count: category.product_count,
          })}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <span className="pcat-order">{category.sort_order}</span>
      </TableCell>
      <TableCell className="text-right">
        {canManage && (
          <RowActions>
            <RowAction
              icon={Pencil}
              label={t("common.edit")}
              onClick={() => onEdit(category.id)}
            />
            <RowAction
              destructive
              icon={Trash2}
              label={t("common.delete")}
              onClick={() => onDelete(category.id)}
            />
          </RowActions>
        )}
      </TableCell>
    </TableRow>
  );
}
