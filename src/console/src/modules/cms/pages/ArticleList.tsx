import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";
import { formatDateTime } from "@/utils/format";

import { ArticleStatusBadge } from "../components/ArticleStatusBadge";
import { useCategories } from "../hooks/useCmsCategories";
import { useArticles, useDeleteArticle } from "../hooks/useCmsArticles";
import { useTagOptions } from "../hooks/useCmsTags";
import type {
  ArticleListItem,
  ArticleStatus,
} from "../services/articles.service";
import { ARTICLE_STATUSES } from "../utils/articleStatus";
import { flattenTree } from "../utils/categoryTree";

const PAGE_SIZE = 10;
const DEFAULT_SORT = "-updated_at";
const SORTABLE = new Set(["title", "status", "published_at", "updated_at"]);

interface Option {
  value: string;
  label: string;
}

export default function ArticleList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("cms.article.create");
  const canEdit = hasPermission("cms.article.edit");
  const canDelete = hasPermission("cms.article.delete");
  const isReviewer = hasPermission("cms.article.review");

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ArticleStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [tag, setTag] = useState("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [draftStatus, setDraftStatus] = useState<ArticleStatus | "">("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftTag, setDraftTag] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<ArticleListItem | null>(
    null,
  );
  const del = useDeleteArticle();

  const articles = useArticles({
    q: q || undefined,
    status: status || undefined,
    category_id: categoryId || undefined,
    tag: tag || undefined,
    page,
    page_size: PAGE_SIZE,
    sort,
  });

  // Filter option sources (taxonomy). Category is the flattened tree (indented).
  const categories = useCategories();
  const tags = useTagOptions();
  const statusOptions: Option[] = ARTICLE_STATUSES.map((s) => ({
    value: s,
    label: t(`content_status.${s}`),
  }));
  const categoryOptions: Option[] = useMemo(
    () =>
      flattenTree(categories.data ?? []).map((n) => ({
        value: n.id,
        label: "  ".repeat(n.depth) + n.name,
      })),
    [categories.data],
  );
  const tagOptions: Option[] = useMemo(
    () => (tags.data ?? []).map((tg) => ({ value: tg.slug, label: tg.name })),
    [tags.data],
  );

  const items = articles.data?.items ?? [];
  const total = articles.data?.total ?? 0;

  // Toggle a column between ascending and descending. (A 3-state cycle back to
  // the default would strand the default column — "-updated_at" — unable to
  // reach ascending; a 2-state toggle keeps every column symmetric.)
  function cycleSort(col: string) {
    setPage(1);
    setSort((cur) => (cur === col ? `-${col}` : col));
  }
  function sortIcon(col: string) {
    if (sort === col) return ArrowUp;
    if (sort === `-${col}`) return ArrowDown;
    return ArrowUpDown;
  }

  function handleFilterOpenChange(next: boolean) {
    if (next) {
      setDraftQ(q);
      setDraftStatus(status);
      setDraftCategory(categoryId);
      setDraftTag(tag);
    }
    setFilterOpen(next);
  }
  function applyFilters() {
    setQ(draftQ.trim());
    setStatus(draftStatus);
    setCategoryId(draftCategory);
    setTag(draftTag);
    setPage(1);
    setFilterOpen(false);
  }
  function resetDraft() {
    setDraftQ("");
    setDraftStatus("");
    setDraftCategory("");
    setDraftTag("");
  }
  function clearAllFilters() {
    setQ("");
    setStatus("");
    setCategoryId("");
    setTag("");
    setPage(1);
  }

  const filtersActive = !!(q || status || categoryId || tag);
  const filterChips: FilterChip[] = [];
  if (q)
    filterChips.push({
      key: "q",
      label: t("cms.articles.filter.q"),
      value: q,
      onRemove: () => {
        setQ("");
        setPage(1);
      },
    });
  if (status)
    filterChips.push({
      key: "status",
      label: t("cms.articles.col.status"),
      value: t(`content_status.${status}`),
      onRemove: () => {
        setStatus("");
        setPage(1);
      },
    });
  if (categoryId)
    filterChips.push({
      key: "category",
      label: t("cms.articles.col.category"),
      value:
        categoryOptions.find((o) => o.value === categoryId)?.label.trim() ??
        categoryId,
      onRemove: () => {
        setCategoryId("");
        setPage(1);
      },
    });
  if (tag)
    filterChips.push({
      key: "tag",
      label: t("cms.articles.filter.tag"),
      value: tagOptions.find((o) => o.value === tag)?.label ?? tag,
      onRemove: () => {
        setTag("");
        setPage(1);
      },
    });

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success(t("cms.articles.toast.delete_success"));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  function SortHead({ col, label }: { col: string; label: string }) {
    const Icon = sortIcon(col);
    if (!SORTABLE.has(col)) return <TableHead>{label}</TableHead>;
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
        title={t("cms.articles.title")}
        subtitle={t("cms.articles.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_articles" }]}
      />

      <ListToolbar
        onRefresh={() => void articles.refetch()}
        refreshDisabled={articles.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={handleFilterOpenChange}
            onApply={applyFilters}
            onReset={resetDraft}
            filterActive={filtersActive}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cms-article-q">
                  {t("cms.articles.filter.q")}
                </Label>
                <Input
                  id="cms-article-q"
                  type="search"
                  value={draftQ}
                  placeholder={t("cms.articles.filter.q_ph")}
                  onChange={(e) => setDraftQ(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("cms.articles.col.status")}</Label>
                <Select<Option>
                  options={statusOptions}
                  value={
                    statusOptions.find((o) => o.value === draftStatus) ?? null
                  }
                  placeholder={t("cms.articles.filter.any")}
                  onChange={(o) =>
                    setDraftStatus((o?.value as ArticleStatus) ?? "")
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("cms.articles.col.category")}</Label>
                <Select<Option>
                  options={categoryOptions}
                  value={
                    categoryOptions.find((o) => o.value === draftCategory) ??
                    null
                  }
                  placeholder={t("cms.articles.filter.any")}
                  onChange={(o) => setDraftCategory(o?.value ?? "")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("cms.articles.filter.tag")}</Label>
                <Select<Option>
                  options={tagOptions}
                  value={tagOptions.find((o) => o.value === draftTag) ?? null}
                  placeholder={t("cms.articles.filter.any")}
                  onChange={(o) => setDraftTag(o?.value ?? "")}
                />
              </div>
            </div>
          </FilterPopover>
        }
      >
        {canCreate && (
          <Button type="button" onClick={() => navigate("/cms/articles/new")}>
            <Plus className="size-4" />
            {t("cms.articles.btn.create")}
          </Button>
        )}
      </ListToolbar>

      <FilterChips
        items={filterChips}
        onClearAll={filtersActive ? clearAllFilters : undefined}
      />

      {articles.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(articles.error, t).message}
        />
      ) : articles.isLoading && !articles.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Table scroll={false} data-testid="cms-articles-table">
            <TableHeader>
              <TableRow>
                <SortHead col="title" label={t("cms.articles.col.title")} />
                <SortHead col="status" label={t("cms.articles.col.status")} />
                <TableHead>{t("cms.articles.col.category")}</TableHead>
                <TableHead>{t("cms.articles.col.author")}</TableHead>
                <SortHead
                  col="published_at"
                  label={t("cms.articles.col.published")}
                />
                <SortHead
                  col="updated_at"
                  label={t("cms.articles.col.updated")}
                />
                <TableHead className="w-12 text-right">
                  {t("cms.articles.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={7} />}
              {items.map((a) => {
                const showDelete =
                  canDelete && (isReviewer || a.status === "draft");
                return (
                  <TableRow key={a.id}>
                    <TableCell className="min-w-[16rem] font-medium">
                      <Link
                        to={`/cms/articles/${a.id}`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {a.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ArticleStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      {a.category ? (
                        <Badge variant="secondary">{a.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.author.name}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      title={a.published_at ?? undefined}
                    >
                      {a.published_at ? formatDateTime(a.published_at) : "—"}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      title={a.updated_at}
                    >
                      {formatDateTime(a.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(canEdit || showDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("cms.articles.col.actions")}
                              title={t("cms.articles.col.actions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  navigate(`/cms/articles/${a.id}`)
                                }
                              >
                                <Pencil className="size-4" />
                                {t("common.edit")}
                              </DropdownMenuItem>
                            )}
                            {showDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  onSelect={() => setDeleteTarget(a)}
                                >
                                  <Trash2 className="size-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("cms.articles.dialog.delete.title")}
        description={t("cms.articles.dialog.delete.description", {
          title: deleteTarget?.title ?? "",
        })}
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        loading={del.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
