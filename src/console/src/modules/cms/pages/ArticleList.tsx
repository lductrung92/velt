import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  FileText,
  FolderTree,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import i18n from "@/app/i18n";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { ArticleStatusBadge } from "../components/ArticleStatusBadge";
import { useCategories } from "../hooks/useCmsCategories";
import {
  useArticleOverview,
  useArticles,
  useDeleteArticle,
} from "../hooks/useCmsArticles";
import { useTagOptions } from "../hooks/useCmsTags";
import type {
  ArticleListItem,
  ArticleStatus,
} from "../services/articles.service";
import { ARTICLE_STATUSES } from "../utils/articleStatus";
import { flattenTree } from "../utils/categoryTree";

import "@/styles/list-page.css";
import "./articles.css";

const PAGE_SIZE = 10;
const DEFAULT_SORT = "-updated_at";
const SORTABLE = new Set(["title", "status", "published_at", "updated_at"]);

// The overview cards and the status each one filters to. "" is the unfiltered
// total, which is why it comes first.
const OVERVIEW = [
  { status: "", key: "total", Icon: FileText },
  { status: "draft", key: "draft", Icon: PenLine },
  { status: "pending_review", key: "pending_review", Icon: Send },
  { status: "published", key: "published", Icon: CalendarClock },
] as const;

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
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState<ArticleStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [tag, setTag] = useState("");
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
  const overview = useArticleOverview(
    OVERVIEW.map((o) => o.status),
    !articles.isError,
  );

  const categories = useCategories();
  const tags = useTagOptions();
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
  const hasFilters = !!(q || status || categoryId || tag);

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
  function setStage(value: string) {
    setStatus(value as ArticleStatus | "");
    setPage(1);
  }
  function reset() {
    setQ("");
    setDraftQ("");
    setStatus("");
    setCategoryId("");
    setTag("");
    setPage(1);
  }

  const filterChips: FilterChip[] = [];
  if (q)
    filterChips.push({
      key: "q",
      label: t("cms.articles.filter.q"),
      value: q,
      onRemove: () => {
        setQ("");
        setDraftQ("");
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

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const titleCell = (a: ArticleListItem) => (
    <div className="article-title">
      <Link to={`/cms/articles/${a.id}`}>{a.title}</Link>
      <span className="article-slug">{a.slug}</span>
    </div>
  );
  const taxonomy = (a: ArticleListItem) =>
    a.category ? (
      <div className="article-taxonomy">
        <span>
          <FolderTree className="size-3" aria-hidden />
          {a.category.name}
        </span>
      </div>
    ) : (
      <span className="article-muted">{t("cms.articles.no_category")}</span>
    );
  const author = (a: ArticleListItem) => (
    <span className="article-author">
      <User className="size-3" aria-hidden />
      {a.author.name}
    </span>
  );
  // Published date on top, last edit underneath: an editor scanning the list
  // wants to know what is live before knowing when it was last touched.
  const dates = (a: ArticleListItem) => (
    <span className="article-dates">
      {a.published_at ? (
        <strong>{date(a.published_at)}</strong>
      ) : (
        <span>{t("cms.articles.not_published")}</span>
      )}
      <span>
        {date(a.updated_at)} · {time(a.updated_at)}
      </span>
    </span>
  );
  const actions = (a: ArticleListItem) => {
    const showDelete = canDelete && (isReviewer || a.status === "draft");
    if (!canEdit && !showDelete) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("cms.articles.col.actions")}
            title={t("cms.articles.col.actions")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => navigate(`/cms/articles/${a.id}`)}
            >
              <Pencil className="size-4" />
              {t("common.edit")}
            </DropdownMenuItem>
          )}
          {canEdit && showDelete && <DropdownMenuSeparator />}
          {showDelete && (
            <DropdownMenuItem destructive onSelect={() => setDeleteTarget(a)}>
              <Trash2 className="size-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="list-page" data-list="articles">
      <PageHeader
        title={t("cms.articles.title")}
        subtitle={t("cms.articles.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_articles" }]}
      />

      <div
        className="list-overview"
        aria-label={t("cms.articles.overview.label")}
      >
        {OVERVIEW.map(({ status: value, key, Icon }, index) => (
          <button
            type="button"
            key={key}
            className="list-metric"
            data-kind={key}
            aria-pressed={value ? status === value : !hasFilters}
            onClick={() => (value ? setStage(value) : reset())}
          >
            <span className="list-metric-top">
              <span>{t(`cms.articles.overview.${key}`)}</span>
              <span className="list-metric-icon">
                <Icon className="size-4" aria-hidden />
              </span>
            </span>
            <strong>
              {overview[index].isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : overview[index].isError ? (
                "—"
              ) : (
                new Intl.NumberFormat(i18n.language).format(
                  overview[index].data?.total ?? 0,
                )
              )}
            </strong>
            <span className="list-metric-bottom">
              {t(`cms.articles.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section className="list-panel" aria-label={t("cms.articles.list_title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("cms.articles.list_title")}</h2>
            <p>
              {articles.isPending || articles.isError
                ? t("cms.articles.list_hint")
                : t("cms.articles.record_count", { count: total })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={articles.isFetching}
              onClick={() => {
                void articles.refetch();
                overview.forEach((query) => void query.refetch());
              }}
            >
              <RotateCcw
                className={
                  articles.isFetching
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden
              />
              {t("common.refresh")}
            </Button>
            {canCreate && (
              <Button
                type="button"
                size="sm"
                onClick={() => navigate("/cms/articles/new")}
              >
                <Plus className="size-4" />
                {t("cms.articles.btn.create")}
              </Button>
            )}
          </div>
        </div>

        <div className="list-toolbar">
          <form
            className="list-search"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(draftQ.trim());
              setPage(1);
            }}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("cms.articles.search_label")}
              placeholder={t("cms.articles.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                // Clearing the box clears the applied search too; making
                // someone press Enter on an empty field to see everything again
                // is a trap.
                if (!value && q) {
                  setQ("");
                  setPage(1);
                }
              }}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("cms.articles.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
          <div className="list-filter-controls">
            <div className="list-filter-select">
              <Select<Option>
                inputId="cms-article-category"
                aria-label={t("cms.articles.col.category")}
                placeholder={t("cms.articles.all_categories")}
                options={categoryOptions}
                value={
                  categoryOptions.find((o) => o.value === categoryId) ?? null
                }
                onChange={(option) => {
                  setCategoryId(option?.value ?? "");
                  setPage(1);
                }}
              />
            </div>
            <div className="list-filter-select">
              <Select<Option>
                inputId="cms-article-tag"
                aria-label={t("cms.articles.filter.tag")}
                placeholder={t("cms.articles.all_tags")}
                options={tagOptions}
                value={tagOptions.find((o) => o.value === tag) ?? null}
                onChange={(option) => {
                  setTag(option?.value ?? "");
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <div
          className="list-tabs"
          role="group"
          aria-label={t("cms.articles.filter_status")}
        >
          <button
            type="button"
            aria-pressed={!status}
            onClick={() => setStage("")}
          >
            {t("cms.articles.all_statuses")}
          </button>
          {ARTICLE_STATUSES.map((value) => (
            <button
              type="button"
              key={value}
              data-status={value}
              aria-pressed={status === value}
              onClick={() => setStage(value)}
            >
              <i aria-hidden />
              {t(`content_status.${value}`)}
            </button>
          ))}
        </div>

        <FilterChips
          className="list-filter-chips"
          items={filterChips}
          onClearAll={filterChips.length ? reset : undefined}
        />

        {articles.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(articles.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void articles.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : articles.isPending ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="list-empty">
            <div className="list-empty-art" aria-hidden>
              <span className="list-empty-ring" />
              <div className="list-empty-card">
                <span>
                  <FileText className="size-5" />
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
                  ? "cms.articles.no_results"
                  : "cms.articles.empty_title",
              )}
            </h3>
            <p>
              {t(
                hasFilters
                  ? "cms.articles.no_results_hint"
                  : "cms.articles.empty_hint",
              )}
            </p>
            {hasFilters ? (
              <Button variant="outline" size="sm" onClick={reset}>
                {t("common.reset")}
              </Button>
            ) : (
              canCreate && (
                <Button size="sm" onClick={() => navigate("/cms/articles/new")}>
                  <Plus className="size-4" />
                  {t("cms.articles.btn.create")}
                </Button>
              )
            )}
          </div>
        ) : (
          <>
            <div className="list-table-wrap">
              <div className="list-desktop">
                <Table scroll={false} data-testid="cms-articles-table">
                  <TableHeader>
                    <TableRow>
                      {sortHead("title", t("cms.articles.col.title"))}
                      {sortHead("status", t("cms.articles.col.status"))}
                      <TableHead>{t("cms.articles.col.category")}</TableHead>
                      <TableHead>{t("cms.articles.col.author")}</TableHead>
                      {sortHead(
                        "published_at",
                        t("cms.articles.col.published"),
                      )}
                      {sortHead("updated_at", t("cms.articles.col.updated"))}
                      <TableHead className="text-right">
                        {t("cms.articles.col.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => (
                      <TableRow key={a.id} data-testid="cms-article-row">
                        <TableCell>{titleCell(a)}</TableCell>
                        <TableCell>
                          <ArticleStatusBadge status={a.status} />
                        </TableCell>
                        <TableCell>{taxonomy(a)}</TableCell>
                        <TableCell>{author(a)}</TableCell>
                        <TableCell>
                          {a.published_at ? (
                            <span className="article-dates">
                              <strong>{date(a.published_at)}</strong>
                            </span>
                          ) : (
                            <span className="article-muted">
                              {t("cms.articles.not_published")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="article-dates">
                            <strong>{date(a.updated_at)}</strong>
                            <span>{time(a.updated_at)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {actions(a)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="list-mobile">
                {items.map((a) => (
                  <div className="article-mobile-card" key={a.id}>
                    <div className="article-mobile-heading">
                      {titleCell(a)}
                      {actions(a)}
                    </div>
                    <div className="article-mobile-meta">
                      <ArticleStatusBadge status={a.status} />
                      {taxonomy(a)}
                      {author(a)}
                    </div>
                    {dates(a)}
                  </div>
                ))}
              </div>
            </div>

            <div className="list-pagination">
              <TablePagination
                page={page}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </section>

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
