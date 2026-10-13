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
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  FileText,
  FolderOpen,
  FolderTree,
  Inbox,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import i18n from "@/app/i18n";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
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
  type FlatCategory,
} from "../utils/categoryTree";

import "@/styles/list-page.css";
import "./categories.css";

// Sortable columns. Sorting (or searching, or an overview filter) switches the
// table to a FLAT view — drag-reorder by sort_order only makes sense on the
// unfiltered tree.
const SORTABLE = new Set(["name", "slug"]);

// The overview cards. Categories have no status, so each card carries its own
// predicate rather than a status string.
const OVERVIEW = [
  { key: "total", Icon: FolderTree, match: null },
  { key: "roots", Icon: FolderOpen, match: (n: FlatCategory) => n.depth === 0 },
  {
    key: "used",
    Icon: FileText,
    match: (n: FlatCategory) => n.articleCount > 0,
  },
  {
    key: "unused",
    Icon: Inbox,
    match: (n: FlatCategory) => n.articleCount === 0,
  },
] as const;

type Scope = (typeof OVERVIEW)[number]["key"];

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
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("total");

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

  // Flat view = anything that narrows or resequences the list. The tree (with
  // drag-reorder) is the default when none of them is set: a handle that moves
  // a row within a filtered subset would be writing a sort_order the user
  // cannot see.
  const flatMode = q !== "" || sort !== null || scope !== "total";

  const counts = OVERVIEW.map(({ match }) =>
    match ? flat.filter(match).length : flat.length,
  );

  const rowsForView = useMemo(() => {
    let list = flat;
    const card = OVERVIEW.find((o) => o.key === scope);
    if (card?.match) list = list.filter(card.match);
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
  }, [flat, q, sort, scope]);

  // In tree mode the dragged node's subtree is lifted out so it cannot be
  // dropped inside itself.
  const rows = flatMode
    ? rowsForView
    : activeId
      ? removeDescendants(flat, activeId)
      : flat;

  const projected =
    !flatMode && activeId && overId && activeId !== overId
      ? getProjection(rows, activeId, overId, offsetLeft)
      : null;

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

  // A sortable heading is a button inside a th. The th keeps aria-sort so the
  // current order is announced, not merely drawn.
  const sortHead = (col: string, label: string) => {
    if (!SORTABLE.has(col)) return <TableHead key={col}>{label}</TableHead>;
    const Icon = sortIcon(col);
    const ariaSort =
      sort === col ? "ascending" : sort === `-${col}` ? "descending" : "none";
    return (
      <TableHead key={col} aria-sort={ariaSort}>
        <button type="button" onClick={() => cycleSort(col)}>
          {label}
          <Icon className="size-3.5" aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="list-page" data-list="categories">
      <PageHeader
        title={t("cms.categories.title")}
        subtitle={t("cms.categories.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_categories" }]}
      />

      <div
        className="list-overview"
        aria-label={t("cms.categories.overview.label")}
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
              <span>{t(`cms.categories.overview.${key}`)}</span>
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
              {t(`cms.categories.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section
        className="list-panel"
        aria-label={t("cms.categories.list_title")}
      >
        <div className="list-panel-heading">
          <div>
            <h2>{t("cms.categories.list_title")}</h2>
            <p>
              {categories.isPending || categories.isError
                ? t("cms.categories.list_hint")
                : t("cms.categories.record_count", { count: flat.length })}
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
                onClick={() => navigate("/cms/categories/new")}
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
              aria-label={t("cms.categories.search_label")}
              placeholder={t("cms.categories.search_ph")}
              // The whole tree is already in memory, so searching as you type
              // costs nothing and waiting for Enter would be pure friction.
              onChange={(event) => setQ(event.target.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("cms.categories.search_label")}
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
                  <FolderTree className="size-5" />
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
                flatMode
                  ? "cms.categories.no_results"
                  : "cms.categories.empty_title",
              )}
            </h3>
            <p>
              {t(
                flatMode
                  ? "cms.categories.no_results_hint"
                  : "cms.categories.empty_hint",
              )}
            </p>
            {!flatMode && canManage && (
              <Button size="sm" onClick={() => navigate("/cms/categories/new")}>
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {flatMode && (
              <p className="category-flat-notice">
                {t("cms.categories.flat_notice")}
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={resetDrag}
            >
              <div className="list-desktop">
                <Table
                  scroll={false}
                  data-testid="cms-categories-table"
                  wrapperClassName="list-table-wrap"
                >
                  <TableHeader>
                    <TableRow>
                      {sortHead("name", t("cms.categories.col.name"))}
                      {sortHead("slug", t("cms.categories.col.slug"))}
                      <TableHead>
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
                          onEdit={(id) => navigate(`/cms/categories/${id}`)}
                          onDelete={(id) =>
                            setDeleteTarget(findCategory(tree, id) ?? null)
                          }
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </div>
            </DndContext>

            {/* Reading only: dragging a row to a new parent needs a pointer and
                a column wide enough to show the indent, so the handle stays on
                the desktop table. */}
            <div className="list-mobile">
              {rows.map((node) => (
                <div className="category-mobile-card" key={node.id}>
                  <div className="category-mobile-heading">
                    <div
                      className="category-name"
                      style={{ paddingLeft: flatMode ? 0 : node.depth * 14 }}
                    >
                      {!flatMode && node.depth > 0 && (
                        <span className="category-branch" aria-hidden />
                      )}
                      <strong>{node.name}</strong>
                    </div>
                    {canManage && (
                      <div className="category-row-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.edit")}
                          onClick={() => navigate(`/cms/categories/${node.id}`)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.delete")}
                          onClick={() =>
                            setDeleteTarget(findCategory(tree, node.id) ?? null)
                          }
                        >
                          <Trash2 className="size-4 text-destructive-ink" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="category-mobile-meta">
                    <span
                      className="category-count"
                      data-empty={node.articleCount === 0 ? "true" : "false"}
                    >
                      <FileText className="size-3" aria-hidden />
                      {t("cms.categories.article_count", {
                        count: node.articleCount,
                      })}
                    </span>
                    <span className="category-slug">{node.slug}</span>
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
