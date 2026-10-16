import {
  ArrowRight,
  Image as ImageIcon,
  Package,
  PenLine,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import i18n from "@/app/i18n";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { PageHeader } from "@/components/common/PageHeader";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { Select } from "@/components/common/Select";
import { SortableHead } from "@/components/common/SortableHead";
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
import { usePaging } from "@/hooks/usePaging";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import {
  ProductLifecycleBadge,
  ProductStatusBadge,
} from "../components/ProductStatusBadge";
import {
  useDeleteProduct,
  useProductOverview,
  useProducts,
} from "../hooks/useProducts";
import {
  PRODUCT_AUDIENCES,
  PRODUCT_LIFECYCLES,
  PRODUCT_PLATFORMS,
  PRODUCT_STATUSES,
  type ProductLifecycle,
  type ProductListItem,
  type ProductListParams,
  type ProductStatus,
} from "../services/products.service";

import "@/styles/list-page.css";
import "./products.css";
import { fileUrl } from "@/utils/fileUrl";

// The overview cards and the filter each one applies. "Featured" reads a flag
// rather than a status, which is why a card carries a whole params object.
const OVERVIEW = [
  { key: "total", Icon: Package, filter: {} as ProductListParams },
  { key: "draft", Icon: PenLine, filter: { status: "draft" } },
  { key: "published", Icon: Send, filter: { status: "published" } },
  { key: "featured", Icon: Sparkles, filter: { featured: true } },
] as const;

interface Option {
  value: string;
  label: string;
}

export default function ProductList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("products.create");
  const canDelete = hasPermission("products.delete");

  // Page, page size and pager style all come from the shared settings
  // (Settings → General → Pagination), so every list pages the same way.
  const paging = usePaging();
  const { page, setPage } = paging;
  const [sort, setSort] = useState<string | null>("-updated_at");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [lifecycle, setLifecycle] = useState<ProductLifecycle | "">("");
  const [platform, setPlatform] = useState("");
  const [audience, setAudience] = useState("");
  const [featured, setFeatured] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(
    null,
  );

  const params = useMemo(
    () => ({
      q: q || undefined,
      status: status || undefined,
      lifecycle: lifecycle || undefined,
      platform: platform || undefined,
      audience: audience || undefined,
      featured: featured || undefined,
      sort: sort ?? undefined,
      page,
      page_size: paging.pageSize,
    }),
    [
      q,
      status,
      lifecycle,
      platform,
      audience,
      featured,
      sort,
      page,
      paging.pageSize,
    ],
  );
  const products = useProducts(params);
  const del = useDeleteProduct();
  const overview = useProductOverview(
    OVERVIEW.map((o) => o.filter),
    !products.isError,
  );

  const rows = products.data?.items ?? [];
  const total = products.data?.total ?? 0;
  const hasFilters = !!(
    q ||
    status ||
    lifecycle ||
    platform ||
    audience ||
    featured
  );

  function reset() {
    setQ("");
    setDraftQ("");
    setStatus("");
    setLifecycle("");
    setPlatform("");
    setAudience("");
    setFeatured(false);
    setPage(1);
  }
  // A narrower result set makes the old page number meaningless, so every
  // filter change goes back to page 1.
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }
  function pickCard(key: (typeof OVERVIEW)[number]["key"]) {
    if (key === "total") return reset();
    narrow(() => {
      if (key === "featured") {
        setStatus("");
        setFeatured((on) => !on);
        return;
      }
      setFeatured(false);
      setStatus((cur) => (cur === key ? "" : (key as ProductStatus)));
    });
  }

  const statusOptions: Option[] = PRODUCT_STATUSES.map((s) => ({
    value: s,
    label: t(`products.status.${s}`),
  }));
  const lifecycleOptions: Option[] = PRODUCT_LIFECYCLES.map((l) => ({
    value: l,
    label: t(`products.lifecycle.${l}`),
  }));
  const platformOptions: Option[] = PRODUCT_PLATFORMS.map((p) => ({
    value: p,
    label: t(`products.platform.${p}`),
  }));
  const audienceOptions: Option[] = PRODUCT_AUDIENCES.map((a) => ({
    value: a,
    label: t(`products.audience.${a}`),
  }));

  const filterChips: FilterChip[] = [];
  if (q)
    filterChips.push({
      key: "q",
      label: t("products.search_label"),
      value: q,
      onRemove: () =>
        narrow(() => {
          setQ("");
          setDraftQ("");
        }),
    });
  if (lifecycle)
    filterChips.push({
      key: "lifecycle",
      label: t("products.col.lifecycle"),
      value: t(`products.lifecycle.${lifecycle}`),
      onRemove: () => narrow(() => setLifecycle("")),
    });
  if (platform)
    filterChips.push({
      key: "platform",
      label: t("products.field.platforms"),
      value: t(`products.platform.${platform}`),
      onRemove: () => narrow(() => setPlatform("")),
    });
  if (audience)
    filterChips.push({
      key: "audience",
      label: t("products.field.audience"),
      value: t(`products.audience.${audience}`),
      onRemove: () => narrow(() => setAudience("")),
    });
  if (featured)
    filterChips.push({
      key: "featured",
      label: t("products.field.featured"),
      value: t("products.featured_badge"),
      onRemove: () => narrow(() => setFeatured(false)),
    });

  function confirmDelete() {
    if (!deleteTarget) return;
    del.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t("products.delete.success"));
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  }

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  const identity = (p: ProductListItem) => (
    <div className="product-identity">
      <span className="product-cover">
        {p.cover_url ? (
          <img src={fileUrl(p.cover_url)} alt="" loading="lazy" />
        ) : (
          <ImageIcon className="size-4" aria-label={t("products.no_cover")} />
        )}
      </span>
      <span className="product-title">
        <span className="product-title-line">
          <button
            type="button"
            title={p.name}
            onClick={() => navigate(`/products/${p.id}`)}
          >
            {p.name}
          </button>
          {p.is_featured && (
            <span
              className="product-featured"
              title={t("products.featured_badge")}
            >
              <Sparkles className="size-3.5" aria-hidden />
            </span>
          )}
        </span>
        <span className="product-slug" title={p.slug}>
          {p.slug}
        </span>
      </span>
    </div>
  );

  const actions = (p: ProductListItem) => (
    <RowActions>
      <RowAction
        icon={Pencil}
        label={t("common.edit")}
        onClick={() => navigate(`/products/${p.id}`)}
      />
      {canDelete && (
        <RowAction
          destructive
          icon={Trash2}
          label={t("common.delete")}
          onClick={() => setDeleteTarget(p)}
        />
      )}
    </RowActions>
  );

  const filterSelect = (
    id: string,
    label: string,
    placeholder: string,
    options: Option[],
    value: string,
    onPick: (next: string) => void,
  ) => (
    <div className="list-filter-select">
      <Select<Option>
        inputId={id}
        aria-label={label}
        isSearchable={false}
        placeholder={placeholder}
        options={options}
        value={options.find((o) => o.value === value) ?? null}
        onChange={(option) => narrow(() => onPick(option?.value ?? ""))}
      />
    </div>
  );

  return (
    <div className="list-page" data-list="products">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
      />

      <div className="list-overview" aria-label={t("products.overview.label")}>
        {OVERVIEW.map(({ key, Icon }, index) => (
          <button
            type="button"
            key={key}
            className="list-metric"
            data-kind={key}
            aria-pressed={
              key === "total"
                ? !hasFilters
                : key === "featured"
                  ? featured
                  : status === key
            }
            onClick={() => pickCard(key)}
          >
            <span className="list-metric-top">
              <span>{t(`products.overview.${key}`)}</span>
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
              {t(`products.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section className="list-panel" aria-label={t("products.list_title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("products.list_title")}</h2>
            <p>
              {products.isPending || products.isError
                ? t("products.list_hint")
                : t("products.record_count", { count: total })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={products.isFetching}
              onClick={() => {
                void products.refetch();
                overview.forEach((query) => void query.refetch());
              }}
            >
              <RotateCcw
                className={
                  products.isFetching
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
                onClick={() => navigate("/products/new")}
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
              narrow(() => setQ(draftQ.trim()));
            }}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("products.search_label")}
              placeholder={t("products.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                // Clearing the box clears the applied search too; making
                // someone press Enter on an empty field to see everything again
                // is a trap.
                if (!value && q) narrow(() => setQ(""));
              }}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("products.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
          {/* Three axes beside the search box: the toolbar wraps rather than
              overflowing once the panel is narrow. */}
          <div className="list-filter-controls">
            {filterSelect(
              "product-lifecycle",
              t("products.col.lifecycle"),
              t("products.all_lifecycles"),
              lifecycleOptions,
              lifecycle,
              (next) => setLifecycle(next as ProductLifecycle | ""),
            )}
            {filterSelect(
              "product-platform",
              t("products.field.platforms"),
              t("products.all_platforms"),
              platformOptions,
              platform,
              setPlatform,
            )}
            {filterSelect(
              "product-audience",
              t("products.field.audience"),
              t("products.all_audiences"),
              audienceOptions,
              audience,
              setAudience,
            )}
          </div>
        </div>

        <div
          className="list-tabs"
          role="group"
          aria-label={t("products.filter_status")}
        >
          <button
            type="button"
            aria-pressed={!status}
            onClick={() => narrow(() => setStatus(""))}
          >
            {t("products.all_statuses")}
          </button>
          {statusOptions.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              data-status={value}
              aria-pressed={status === value}
              onClick={() =>
                narrow(() =>
                  setStatus(status === value ? "" : (value as ProductStatus)),
                )
              }
            >
              <i aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <FilterChips
          className="list-filter-chips"
          items={filterChips}
          onClearAll={filterChips.length ? reset : undefined}
        />

        {products.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(products.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void products.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : products.isPending ? (
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
                  <Package className="size-5" />
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
              {t(hasFilters ? "products.no_results" : "products.empty_title")}
            </h3>
            <p>
              {t(
                hasFilters ? "products.no_results_hint" : "products.empty_hint",
              )}
            </p>
            {!hasFilters && canCreate && (
              <Button size="sm" onClick={() => navigate("/products/new")}>
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
                data-testid="products-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      col="name"
                      label={t("products.col.name")}
                      sort={sort}
                      onSort={setSort}
                    />
                    <TableHead>{t("products.col.status")}</TableHead>
                    <TableHead>{t("products.col.lifecycle")}</TableHead>
                    <SortableHead
                      col="released_at"
                      label={t("products.col.released_at")}
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableHead
                      col="updated_at"
                      label={t("products.col.updated_at")}
                      sort={sort}
                      onSort={setSort}
                    />
                    <TableHead className="text-right">
                      {t("products.col.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id} data-testid="product-row">
                      <TableCell>{identity(p)}</TableCell>
                      <TableCell>
                        <ProductStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <ProductLifecycleBadge lifecycle={p.lifecycle} />
                      </TableCell>
                      <TableCell>
                        {p.released_at ? (
                          <span className="product-dates">
                            <strong>{p.released_at}</strong>
                          </span>
                        ) : (
                          <span className="product-muted">
                            {t("products.not_released")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="product-dates">
                          <strong>{date(p.updated_at)}</strong>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{actions(p)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile">
              {rows.map((p) => (
                <div className="product-mobile-card" key={p.id}>
                  <div className="product-mobile-heading">
                    {identity(p)}
                    {actions(p)}
                  </div>
                  <div className="product-mobile-meta">
                    <ProductStatusBadge status={p.status} />
                    <ProductLifecycleBadge lifecycle={p.lifecycle} />
                    <span className="product-muted">
                      {p.released_at ?? t("products.not_released")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Outside the card on purpose: the panel holds the records, the
          pager is how you ask for the next ones. It hides itself when
          everything fits on one page, so it costs nothing while loading
          or on an empty list. */}
      <div className="list-pagination">
        <ListPager
          paging={paging}
          total={total}
          loading={products.isFetching}
        />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("products.delete.title")}
        description={t("products.delete.description", {
          name: deleteTarget?.name ?? "",
        })}
        confirmLabel={t("common.delete")}
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
