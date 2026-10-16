import {
  ArrowRight,
  FileStack,
  LayoutTemplate,
  Pencil,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import i18n from "@/app/i18n";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { Button } from "@/components/ui/button";
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
import { ListPager } from "@/components/ui/list-pager";
import { useDebounce } from "@/hooks/useDebounce";
import { usePaging } from "@/hooks/usePaging";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { PageStatusBadge } from "../components/PageStatusBadge";
import {
  useDeletePage,
  usePageOverview,
  usePages,
} from "../hooks/useCmsPages";
import type { PageListItem, PageStatus } from "../services/pages.service";

import "@/styles/list-page.css";
import "./pages-list.css";

const PAGE_STATUSES: PageStatus[] = [
  "draft",
  "scheduled",
  "published",
  "archived",
];

// The overview cards, in the order usePageOverview answers them. Their counts
// come from the server now: the list is paginated, so what is on screen is no
// longer the whole truth to count.
const OVERVIEW = [
  { key: "total", Icon: FileStack },
  { key: "draft", Icon: PenLine },
  { key: "published", Icon: Send },
  { key: "landing", Icon: LayoutTemplate },
] as const;

export default function PageList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("cms.page.create");
  const canDelete = hasPermission("cms.page.delete");

  const del = useDeletePage();
  const [toDelete, setToDelete] = useState<PageListItem | null>(null);
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState<PageStatus | "">("");
  const [landingOnly, setLandingOnly] = useState(false);
  // Page, page size and pager style all come from the shared settings
  // (Settings → General → Pagination), so every list pages the same way.
  const paging = usePaging();
  const { page, setPage } = paging;
  // Typing used to be free: the whole tree was in memory. Each keystroke is a
  // request now, so it waits for a pause instead of firing on every letter.
  const q = useDebounce(draftQ.trim());

  const hasFilters = !!(q || status || landingOnly);
  const pagesQuery = usePages({
    q: q || undefined,
    status: status || undefined,
    landing: landingOnly ? "1" : undefined,
    page,
    page_size: paging.pageSize,
  });
  const rows = pagesQuery.data?.items ?? [];
  const total = pagesQuery.data?.total ?? 0;
  const overview = usePageOverview(!pagesQuery.isError);

  // A filter change starts the list again from the top; otherwise page 4 of the
  // old filter asks for page 4 of the new one, which is usually empty.
  useEffect(() => {
    setPage(1);
  }, [q, status, landingOnly, setPage]);

  function reset() {
    setDraftQ("");
    setStatus("");
    setLandingOnly(false);
  }
  function setStage(value: string) {
    setStatus(value as PageStatus | "");
    setLandingOnly(false);
  }
  function pickCard(key: (typeof OVERVIEW)[number]["key"]) {
    if (key === "total") return reset();
    if (key === "landing") {
      setStatus("");
      setLandingOnly((on) => !on);
      return;
    }
    setLandingOnly(false);
    setStatus((cur) => (cur === key ? "" : (key as PageStatus)));
  }

  function confirmDelete() {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success(t("cms.pages.toast.deleted"));
        setToDelete(null);
      },
      onError: (e) => toast.error(parseApiError(e, t).message),
    });
  }

  const titleCell = (node: PageListItem) => (
    <div className="page-title">
      <Link to={`/cms/pages/${node.id}`}>{node.title}</Link>
      {node.landing_id && (
        <span className="page-badge">
          <LayoutTemplate className="size-3" aria-hidden />
          {t("cms.pages.badge.landing")}
        </span>
      )}
    </div>
  );

  const actions = (node: PageListItem) => (
    <RowActions>
      <RowAction
        icon={Pencil}
        label={t("common.edit")}
        to={`/cms/pages/${node.id}`}
      />
      {canDelete && (
        <RowAction
          destructive
          icon={Trash2}
          label={t("common.delete")}
          onClick={() => setToDelete(node)}
        />
      )}
    </RowActions>
  );

  return (
    <div className="list-page" data-list="pages">
      <PageHeader
        title={t("cms.pages.title")}
        subtitle={t("cms.pages.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_pages" }]}
      />

      <div className="list-overview" aria-label={t("cms.pages.overview.label")}>
        {OVERVIEW.map(({ key, Icon }, index) => (
          <button
            type="button"
            key={key}
            className="list-metric"
            data-kind={key}
            aria-pressed={
              key === "total"
                ? !hasFilters
                : key === "landing"
                  ? landingOnly
                  : status === key
            }
            onClick={() => pickCard(key)}
          >
            <span className="list-metric-top">
              <span>{t(`cms.pages.overview.${key}`)}</span>
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
              {t(`cms.pages.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section className="list-panel" aria-label={t("cms.pages.list_title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("cms.pages.list_title")}</h2>
            <p>
              {pagesQuery.isPending || pagesQuery.isError
                ? t("cms.pages.list_hint")
                : t("cms.pages.record_count", { count: total })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagesQuery.isFetching}
              onClick={() => void pagesQuery.refetch()}
            >
              <RotateCcw
                className={
                  pagesQuery.isFetching
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
                onClick={() => navigate("/cms/pages/new")}
              >
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        </div>

        <div className="list-toolbar">
          <form
            className="list-search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("cms.pages.search_label")}
              placeholder={t("cms.pages.search_ph")}
              onChange={(event) => setDraftQ(event.target.value)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("cms.pages.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

        <div
          className="list-tabs"
          role="group"
          aria-label={t("cms.pages.filter_status")}
        >
          <button
            type="button"
            aria-pressed={!status && !landingOnly}
            onClick={reset}
          >
            {t("cms.pages.all_statuses")}
          </button>
          {PAGE_STATUSES.map((value) => (
            <button
              type="button"
              key={value}
              data-status={value}
              aria-pressed={status === value}
              onClick={() => setStage(status === value ? "" : value)}
            >
              <i aria-hidden />
              {t(`content_status.${value}`)}
            </button>
          ))}
        </div>

        {pagesQuery.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(pagesQuery.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void pagesQuery.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : pagesQuery.isPending ? (
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
                  <FileStack className="size-5" />
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
              {t(hasFilters ? "cms.pages.no_results" : "cms.pages.empty_title")}
            </h3>
            <p>
              {t(
                hasFilters
                  ? "cms.pages.no_results_hint"
                  : "cms.pages.empty_hint",
              )}
            </p>
            {!hasFilters && canCreate && (
              <Button size="sm" onClick={() => navigate("/cms/pages/new")}>
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="list-desktop">
              <Table
                scroll={false}
                data-testid="cms-pages-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("cms.pages.col.title")}</TableHead>
                    <TableHead>{t("cms.pages.col.path")}</TableHead>
                    <TableHead>{t("cms.pages.col.status")}</TableHead>
                    <TableHead className="text-right">
                      {t("cms.pages.col.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-testid="cms-page-row">
                      <TableCell>{titleCell(row)}</TableCell>
                      <TableCell>
                        <span className="page-path">/{row.slug}</span>
                      </TableCell>
                      <TableCell>
                        <PageStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {actions(row)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile">
              {rows.map((row) => (
                <div className="page-mobile-card" key={row.id}>
                  <div className="page-mobile-heading">
                    {titleCell(row)}
                    {actions(row)}
                  </div>
                  <div className="page-mobile-meta">
                    <PageStatusBadge status={row.status} />
                    <span className="page-path">/{row.slug}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Outside the card on purpose: the panel holds the records, the pager is
          how you ask for the next ones. */}
      <div className="list-pagination">
        <ListPager
          paging={paging}
          total={total}
          loading={pagesQuery.isFetching}
        />
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("cms.pages.delete_confirm_title")}
        description={
          toDelete
            ? t("cms.pages.delete_confirm_body", { title: toDelete.title })
            : undefined
        }
        confirmLabel={t("common.delete")}
        confirmIcon={Trash2}
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
