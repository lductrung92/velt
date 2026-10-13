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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { PageStatusBadge } from "../components/PageStatusBadge";
import { useDeletePage, usePages } from "../hooks/useCmsPages";
import type { PageNode, PageStatus } from "../services/pages.service";

import "@/styles/list-page.css";
import "./pages-list.css";

const PAGE_STATUSES: PageStatus[] = [
  "draft",
  "scheduled",
  "published",
  "archived",
];

// The overview cards. Three read a status; "landing" reads a different property
// entirely, which is why each card carries its own predicate rather than a
// status string.
const OVERVIEW = [
  { key: "total", Icon: FileStack, match: null },
  { key: "draft", Icon: PenLine, match: (n: PageNode) => n.status === "draft" },
  {
    key: "published",
    Icon: Send,
    match: (n: PageNode) => n.status === "published",
  },
  {
    key: "landing",
    Icon: LayoutTemplate,
    match: (n: PageNode) => !!n.landing_id,
  },
] as const;

type Row = { node: PageNode; depth: number; childCount: number };

function flatten(nodes: PageNode[], depth = 0): Row[] {
  return nodes.flatMap((n) => [
    { node: n, depth, childCount: n.children?.length ?? 0 },
    ...flatten(n.children ?? [], depth + 1),
  ]);
}

export default function PageList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("cms.page.create");
  const canDelete = hasPermission("cms.page.delete");

  const pagesQuery = usePages();
  const del = useDeletePage();
  const [toDelete, setToDelete] = useState<PageNode | null>(null);
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState<PageStatus | "">("");
  const [landingOnly, setLandingOnly] = useState(false);

  // One request returns the whole tree, so every count and filter here is
  // client-side. No per-status round trip, unlike the paginated lists.
  const all = useMemo(() => flatten(pagesQuery.data ?? []), [pagesQuery.data]);
  const hasFilters = !!(q || status || landingOnly);

  const rows = useMemo(() => {
    if (!hasFilters) return all;
    const needle = q.trim().toLowerCase();
    return (
      all
        .filter((r) => !status || r.node.status === status)
        .filter((r) => !landingOnly || !!r.node.landing_id)
        .filter(
          (r) =>
            !needle ||
            r.node.title.toLowerCase().includes(needle) ||
            r.node.slug.toLowerCase().includes(needle),
        )
        // Filtering breaks the hierarchy: a match whose parent was filtered out
        // would be indented under nothing. Flatten instead of drawing a lie.
        .map((r) => ({ ...r, depth: 0 }))
    );
  }, [all, hasFilters, q, status, landingOnly]);

  const counts = OVERVIEW.map(({ match }) =>
    match ? all.filter((r) => match(r.node)).length : all.length,
  );

  function reset() {
    setQ("");
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

  const titleCell = ({ node, depth, childCount }: Row) => (
    <div className="page-title" data-depth={depth}>
      <span className="page-branch" aria-hidden />
      <Link to={`/cms/pages/${node.id}`}>{node.title}</Link>
      {node.landing_id && (
        <span className="page-badge">
          <LayoutTemplate className="size-3" aria-hidden />
          {t("cms.pages.badge.landing")}
        </span>
      )}
      {childCount > 0 && !hasFilters && (
        <span className="page-children">
          {t("cms.pages.child_count", { count: childCount })}
        </span>
      )}
    </div>
  );

  const actions = (node: PageNode) => (
    <div className="page-row-actions">
      <Button asChild variant="ghost" size="icon">
        <Link to={`/cms/pages/${node.id}`} aria-label={t("common.edit")}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
          title={t("common.delete")}
          onClick={() => setToDelete(node)}
        >
          <Trash2 className="size-4 text-destructive-ink" />
        </Button>
      )}
    </div>
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
              {pagesQuery.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : pagesQuery.isError ? (
                "—"
              ) : (
                new Intl.NumberFormat(i18n.language).format(counts[index])
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
                : t("cms.pages.record_count", { count: all.length })}
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
            onSubmit={(event) => {
              event.preventDefault();
              setQ(draftQ.trim());
            }}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("cms.pages.search_label")}
              placeholder={t("cms.pages.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                // The whole tree is already in memory, so searching as you type
                // costs nothing and waiting for Enter would be pure friction.
                setQ(value.trim());
              }}
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
            {hasFilters && (
              <p className="page-flat-notice">{t("cms.pages.flat_notice")}</p>
            )}
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
                    <TableRow key={row.node.id} data-testid="cms-page-row">
                      <TableCell style={{ paddingLeft: 20 + row.depth * 18 }}>
                        {titleCell(row)}
                      </TableCell>
                      <TableCell>
                        <span className="page-path">/{row.node.slug}</span>
                      </TableCell>
                      <TableCell>
                        <PageStatusBadge status={row.node.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {actions(row.node)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile">
              {rows.map((row) => (
                <div className="page-mobile-card" key={row.node.id}>
                  <div className="page-mobile-heading">
                    {titleCell(row)}
                    {actions(row.node)}
                  </div>
                  <div className="page-mobile-meta">
                    <PageStatusBadge status={row.node.status} />
                    <span className="page-path">/{row.node.slug}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

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
