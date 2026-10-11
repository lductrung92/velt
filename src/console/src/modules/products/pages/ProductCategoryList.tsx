import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { SortableHead } from "@/components/common/SortableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { ProductCategoryRow } from "../components/ProductCategoryRow";
import {
  useDeleteProductCategory,
  useProductCategories,
  useReorderProductCategories,
} from "../hooks/useProductCategories";
import type { ProductCategory } from "../services/productCategories.service";

// Sorting (or searching) switches off drag-reorder — ordering by sort_order
// only makes sense on the full, unfiltered list.
export default function ProductCategoryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("products.category.manage");

  const categories = useProductCategories();
  const del = useDeleteProductCategory();
  const reorder = useReorderProductCategories();

  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<ProductCategory[]>([]);
  useEffect(() => {
    if (categories.data) setOrder(categories.data.items);
  }, [categories.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // A search term or an active sort means the rows no longer reflect
  // sort_order, so dragging them would write a meaningless order.
  const reorderable = q === "" && sort === null;

  const rows = useMemo(() => {
    let list = order;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.slug.toLowerCase().includes(needle),
      );
    }
    if (sort) {
      const key = (sort.startsWith("-") ? sort.slice(1) : sort) as "name" | "slug";
      const dir = sort.startsWith("-") ? -1 : 1;
      list = [...list].sort((a, b) => a[key].localeCompare(b[key], "vi") * dir);
    }
    return list;
  }, [order, q, sort]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((c) => c.id === active.id);
    const to = order.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(order, from, to);
    const previous = order;
    setOrder(next);
    reorder.mutate(
      next.map((c) => c.id),
      {
        onError: (err) => {
          // Put the list back, or the UI would claim an order the server does
          // not have.
          setOrder(previous);
          toast.error(parseApiError(err, t).message);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    del.mutate(target.id, {
      onSuccess: () => {
        toast.success(t("products.categories.deleted", { name: target.name }));
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  };

  const filterChips = q
    ? [{ key: "q", label: t("products.categories.search_label"), value: q, onRemove: () => setQ("") }]
    : [];

  return (
    // space-y-3 is the shared list-page rhythm (see every cms list page);
    // without it the header, toolbar and table set their own spacing.
    <div className="space-y-3">
      <PageHeader
        title={t("products.categories.title")}
        subtitle={t("products.categories.subtitle")}
        breadcrumbs={[{ labelKey: "nav.product_categories" }]}
      />

      <ListToolbar
        onRefresh={() => void categories.refetch()}
        refreshDisabled={categories.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open);
              if (open) setDraftQ(q);
            }}
            onApply={() => {
              setQ(draftQ.trim());
              setFilterOpen(false);
            }}
            onReset={() => setDraftQ("")}
            filterActive={q !== ""}
          >
            <div className="space-y-1.5">
              <Label htmlFor="product-category-q">
                {t("products.categories.search_label")}
              </Label>
              <Input
                id="product-category-q"
                type="search"
                value={draftQ}
                placeholder={t("products.categories.search_ph")}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </div>
          </FilterPopover>
        }
      >
        {canManage && (
          <Button type="button" onClick={() => navigate("/product-categories/new")}>
            <Plus className="size-4" />
            {t("common.add_new")}
          </Button>
        )}
      </ListToolbar>

      <FilterChips
        items={filterChips}
        onClearAll={q ? () => setQ("") : undefined}
      />

      {categories.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(categories.error, t).message}
        />
      ) : categories.isLoading && !categories.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table scroll={false} data-testid="product-categories-table">
            <TableHeader>
              <TableRow>
                <SortableHead
                  col="name"
                  label={t("products.categories.col.name")}
                  sort={sort}
                  onSort={setSort}
                />
                <SortableHead
                  col="slug"
                  label={t("products.categories.col.slug")}
                  sort={sort}
                  onSort={setSort}
                />
                <TableHead className="text-right">
                  {t("products.categories.col.product_count")}
                </TableHead>
                <TableHead className="text-right">
                  {t("products.categories.col.sort_order")}
                </TableHead>
                <TableHead className="text-right">
                  {t("products.categories.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableEmpty colSpan={5} />}
              <SortableContext
                items={rows.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((c) => (
                  <ProductCategoryRow
                    key={c.id}
                    category={c}
                    canManage={canManage}
                    reorderable={canManage && reorderable}
                    onEdit={(id) => navigate(`/product-categories/${id}`)}
                    onDelete={() => setDeleteTarget(c)}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("products.categories.delete.title")}
        description={t("products.categories.delete.description", {
          name: deleteTarget?.name ?? "",
          count: deleteTarget?.product_count ?? 0,
        })}
        confirmLabel={t("common.delete")}
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
