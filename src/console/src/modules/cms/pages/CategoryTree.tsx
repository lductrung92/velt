import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
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

import { CategoryTreeRow } from "../components/CategoryTreeRow";
import {
  useCategories,
  useDeleteCategory,
  useReorderCategories,
} from "../hooks/useCmsCategories";
import type { Category } from "../services/categories.service";
import {
  computeReorder,
  findCategory,
  flattenTree,
  getProjection,
  removeDescendants,
} from "../utils/categoryTree";

// Sortable columns. Sorting (or searching) switches the table to a FLAT view —
// drag-reorder by sort_order only makes sense on the unfiltered tree.
const SORTABLE = new Set(["name", "slug"]);

export default function CategoryTree() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("cms.taxonomy.manage");

  const categories = useCategories();
  const del = useDeleteCategory();
  const reorder = useReorderCategories();

  const tree = useMemo(() => categories.data ?? [], [categories.data]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // Search (name/slug) + sort. Either one switches to the flat view.
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");

  // Drag state (tree view only): picked-up node, hovered node, horizontal offset.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Flat view = a search term or an active sort. The tree (with drag-reorder) is
  // the default when neither is set.
  const flatMode = q !== "" || sort !== null;

  const filtered = useMemo(() => {
    let list = flat;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(needle) ||
          n.slug.toLowerCase().includes(needle),
      );
    }
    if (sort) {
      const key = (sort.startsWith("-") ? sort.slice(1) : sort) as
        | "name"
        | "slug";
      const dir = sort.startsWith("-") ? -1 : 1;
      list = [...list].sort((a, b) => a[key].localeCompare(b[key]) * dir);
    }
    return list;
  }, [flat, q, sort]);

  // Rows actually rendered: the flat (filtered/sorted) list, or — in tree mode —
  // the tree with the active node's subtree lifted out while dragging.
  const rows = flatMode
    ? filtered
    : activeId
      ? removeDescendants(flat, activeId)
      : flat;

  const projected =
    !flatMode && activeId && overId && activeId !== overId
      ? getProjection(rows, activeId, overId, offsetLeft)
      : null;

  function openCreate() {
    navigate("/cms/categories/new");
  }
  function openEdit(id: string) {
    navigate(`/cms/categories/${id}`);
  }

  function cycleSort(col: string) {
    setSort((cur) =>
      cur === col ? `-${col}` : cur === `-${col}` ? null : col,
    );
  }
  function sortIcon(col: string) {
    if (sort === col) return ArrowUp;
    if (sort === `-${col}`) return ArrowDown;
    return ArrowUpDown;
  }

  function handleFilterOpenChange(next: boolean) {
    if (next) setDraftQ(q);
    setFilterOpen(next);
  }
  function applyFilters() {
    setQ(draftQ.trim());
    setFilterOpen(false);
  }

  function resetDrag() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  }
  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setOffsetLeft(0);
  }
  function handleDragMove(e: DragMoveEvent) {
    setOffsetLeft(e.delta.x);
  }
  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }
  function handleDragEnd(e: DragEndEvent) {
    const activeIdStr = String(e.active.id);
    const overIdStr = e.over ? String(e.over.id) : null;
    const dx = e.delta.x;
    resetDrag();
    if (!overIdStr) return;

    const list = removeDescendants(flat, activeIdStr);
    const aIdx = list.findIndex((i) => i.id === activeIdStr);
    const oIdx = list.findIndex((i) => i.id === overIdStr);
    if (aIdx === -1 || oIdx === -1) return;

    const proj = getProjection(list, activeIdStr, overIdStr, dx);
    const cloned = arrayMove(list, aIdx, oIdx);
    const { moves, tree: optimisticTree } = computeReorder(
      tree,
      cloned,
      activeIdStr,
      proj.parentId,
    );
    if (moves.length === 0) return;

    reorder.mutate(
      { moves, optimisticTree },
      { onError: (err) => toast.error(parseApiError(err, t).message) },
    );
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success(t("cms.categories.toast.delete_success"));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  const filterChips: FilterChip[] = q
    ? [
        {
          key: "q",
          label: t("cms.categories.search_label"),
          value: q,
          onRemove: () => setQ(""),
        },
      ]
    : [];

  function SortHead({ col, label }: { col: string; label: string }) {
    if (!SORTABLE.has(col)) return <TableHead>{label}</TableHead>;
    const Icon = sortIcon(col);
    const ariaSort =
      sort === col ? "ascending" : sort === `-${col}` ? "descending" : "none";
    return (
      <TableHead aria-sort={ariaSort}>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => cycleSort(col)}
        >
          {label}
          <Icon
            className={
              sort === col || sort === `-${col}`
                ? "size-3.5 text-foreground"
                : "size-3.5 text-muted-foreground/60"
            }
          />
        </button>
      </TableHead>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("cms.categories.title")}
        subtitle={t("cms.categories.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_categories" }]}
      />

      <ListToolbar
        onRefresh={() => void categories.refetch()}
        refreshDisabled={categories.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={handleFilterOpenChange}
            onApply={applyFilters}
            onReset={() => setDraftQ("")}
            filterActive={q !== ""}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cms-category-q">
                {t("cms.categories.search_label")}
              </Label>
              <Input
                id="cms-category-q"
                type="search"
                value={draftQ}
                placeholder={t("cms.categories.search_ph")}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </div>
          </FilterPopover>
        }
      >
        {canManage && (
          <Button type="button" onClick={openCreate}>
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
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={resetDrag}
        >
          <Table scroll={false} data-testid="cms-categories-table">
            <TableHeader>
              <TableRow>
                <SortHead col="name" label={t("cms.categories.col.name")} />
                <SortHead col="slug" label={t("cms.categories.col.slug")} />
                <TableHead className="text-right">
                  {t("cms.categories.col.article_count")}
                </TableHead>
                <TableHead className="text-right">
                  {t("cms.categories.col.sort_order")}
                </TableHead>
                <TableHead className="text-right">
                  {t("cms.categories.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableEmpty colSpan={5} />}
              <SortableContext
                items={rows.map((n) => n.id)}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((node) => (
                  <CategoryTreeRow
                    key={node.id}
                    node={node}
                    depth={
                      flatMode
                        ? 0
                        : node.id === activeId && projected
                          ? projected.depth
                          : node.depth
                    }
                    canManage={canManage}
                    reorderable={!flatMode}
                    onEdit={openEdit}
                    onDelete={(id) =>
                      setDeleteTarget(findCategory(tree, id) ?? null)
                    }
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
        title={t("cms.categories.dialog.delete.title")}
        description={t("cms.categories.dialog.delete.description")}
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        loading={del.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
