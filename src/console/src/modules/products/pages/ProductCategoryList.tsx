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
import {
  ArrowRight,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import i18n from "@/app/i18n";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { SortableHead } from "@/components/common/SortableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
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

import "@/styles/list-page.css";
import "./product-categories.css";

// The overview cards. There is no status here, so each card carries its own
// predicate.
const OVERVIEW = [
  { key: "total", Icon: Shapes, match: null },
  {
    key: "used",
    Icon: Package,
    match: (c: ProductCategory) => c.product_count > 0,
  },
  {
    key: "unused",
    Icon: Package,
    match: (c: ProductCategory) => c.product_count === 0,
  },
] as const;

type Scope = (typeof OVERVIEW)[number]["key"];

export default function ProductCategoryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("products.category.manage");

  const categories = useProductCategories();
  const del = useDeleteProductCategory();
  const reorder = useReorderProductCategories();

  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(
    null,
  );
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("total");

  // Local mirror so a drag renders instantly; the server call follows.
  const [order, setOrder] = useState<ProductCategory[]>([]);
  useEffect(() => {
    if (categories.data) setOrder(categories.data.items);
  }, [categories.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Anything that narrows or resequences the list means the rows no longer
  // reflect sort_order, so dragging them would write an order the user cannot
  // see. The overview cards count as narrowing.
  const reorderable = q === "" && sort === null && scope === "total";
  const hasFilters = !reorderable;

  const counts = OVERVIEW.map(({ match }) =>
    match ? order.filter(match).length : order.length,
  );

  const rows = useMemo(() => {
    let list = order;
    const card = OVERVIEW.find((o) => o.key === scope);
    if (card?.match) list = list.filter(card.match);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.slug.toLowerCase().includes(needle),
      );
    }
    if (sort) {
      const key = (sort.startsWith("-") ? sort.slice(1) : sort) as
        | "name"
        | "slug";
      const dir = sort.startsWith("-") ? -1 : 1;
      list = [...list].sort((a, b) => a[key].localeCompare(b[key], "vi") * dir);
    }
    return list;
  }, [order, q, sort, scope]);

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

  return (
    <div className="list-page" data-list="product-categories">
      <PageHeader
        title={t("products.categories.title")}
        subtitle={t("products.categories.subtitle")}
        breadcrumbs={[{ labelKey: "nav.product_categories" }]}
      />

      <div
        className="list-overview"
        aria-label={t("products.categories.overview.label")}
      >
        {OVERVIEW.map(({ key, Icon }, index) => (
          <button
            type="button"
            key={key}
            className="list-metric"
            data-kind={key}
            aria-pressed={scope === key}
            onClick={() => setScope((cur) => (cur === key ? "total" : key))}
          >
            <span className="list-metric-top">
              <span>{t(`products.categories.overview.${key}`)}</span>
              <span className="list-metric-icon">
                <Icon className="size-4" aria-hidden />
              </span>
            </span>
            <strong>
              {categories.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : categories.isError ? (
                "—"
              ) : (
                new Intl.NumberFormat(i18n.language).format(counts[index])
              )}
            </strong>
            <span className="list-metric-bottom">
              {t(`products.categories.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section
        className="list-panel"
        aria-label={t("products.categories.list_title")}
      >
        <div className="list-panel-heading">
          <div>
            <h2>{t("products.categories.list_title")}</h2>
            <p>
              {categories.isPending || categories.isError
                ? t("products.categories.list_hint")
                : t("products.categories.record_count", {
                    count: order.length,
                  })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={categories.isFetching}
              onClick={() => void categories.refetch()}
            >
              <RotateCcw
                className={
                  categories.isFetching
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden
              />
              {t("common.refresh")}
            </Button>
            {canManage && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate("/product-categories/new")}
              >
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        </div>

        {/* No status axis here, so no tabs row — the toolbar carries the rule
            that would otherwise come from it. */}
        <div className="list-toolbar list-toolbar-edge">
          <form
            className="list-search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={q}
              aria-label={t("products.categories.search_label")}
              placeholder={t("products.categories.search_ph")}
              // The whole list is already in memory, so searching as you type
              // costs nothing and waiting for Enter would be pure friction.
              onChange={(event) => setQ(event.target.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("products.categories.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

        {categories.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(categories.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void categories.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : categories.isPending ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="list-empty">
            <div className="list-empty-art" aria-hidden>
              <span className="list-empty-ring" />
              <div className="list-empty-card">
                <span>
                  <Shapes className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <Plus className="list-empty-plus" />
              </div>
            </div>
            <h3>
              {t(
                hasFilters
                  ? "products.categories.no_results"
                  : "products.categories.empty_title",
              )}
            </h3>
            <p>
              {t(
                hasFilters
                  ? "products.categories.no_results_hint"
                  : "products.categories.empty_hint",
              )}
            </p>
            {!hasFilters && canManage && (
              <Button
                size="sm"
                onClick={() => navigate("/product-categories/new")}
              >
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {hasFilters && (
              <p className="pcat-flat-notice">
                {t("products.categories.flat_notice")}
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="list-desktop">
                <Table
                  scroll={false}
                  data-testid="product-categories-table"
                  wrapperClassName="list-table-wrap"
                >
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
                      <TableHead>
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
              </div>
            </DndContext>

            {/* Reading only: dragging needs a pointer, so the handle stays on
                the desktop table. */}
            <div className="list-mobile">
              {rows.map((c) => (
                <div className="pcat-mobile-card" key={c.id}>
                  <div className="pcat-mobile-heading">
                    <div className="pcat-name">
                      <strong title={c.name}>{c.name}</strong>
                    </div>
                    {canManage && (
                      <RowActions>
                        <RowAction
                          icon={Pencil}
                          label={t("common.edit")}
                          onClick={() =>
                            navigate(`/product-categories/${c.id}`)
                          }
                        />
                        <RowAction
                          destructive
                          icon={Trash2}
                          label={t("common.delete")}
                          onClick={() => setDeleteTarget(c)}
                        />
                      </RowActions>
                    )}
                  </div>
                  <div className="pcat-mobile-meta">
                    <span
                      className="pcat-count"
                      data-empty={c.product_count === 0 ? "true" : "false"}
                    >
                      <Package className="size-3" aria-hidden />
                      {t("products.categories.product_count", {
                        count: c.product_count,
                      })}
                    </span>
                    <span className="pcat-slug" title={c.slug}>
                      {c.slug}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("products.categories.delete.title")}
        description={t("products.categories.delete.description", {
          name: deleteTarget?.name ?? "",
          count: deleteTarget?.product_count ?? 0,
        })}
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
