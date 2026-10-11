import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { SortableHead } from "@/components/common/SortableHead";
import { Button } from "@/components/ui/button";
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
import {
  DEFAULT_PAGE_SIZE,
  TablePagination,
} from "@/components/ui/table-pagination";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import {
  ProductLifecycleBadge,
  ProductStatusBadge,
} from "../components/ProductStatusBadge";
import { useDeleteProduct, useProducts } from "../hooks/useProducts";
import {
  PRODUCT_LIFECYCLES,
  PRODUCT_STATUSES,
  type ProductLifecycle,
  type ProductListItem,
  type ProductStatus,
} from "../services/products.service";

export default function ProductList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("products.create");
  const canDelete = hasPermission("products.delete");

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | null>("-updated_at");

  // Applied filters vs the popover's draft: the list only refetches on Apply.
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [lifecycle, setLifecycle] = useState<ProductLifecycle | "">("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [draftStatus, setDraftStatus] = useState<ProductStatus | "">("");
  const [draftLifecycle, setDraftLifecycle] = useState<ProductLifecycle | "">("");

  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);

  const params = useMemo(
    () => ({
      q: q || undefined,
      status: status || undefined,
      lifecycle: lifecycle || undefined,
      sort: sort ?? undefined,
      page,
      page_size: DEFAULT_PAGE_SIZE,
    }),
    [q, status, lifecycle, sort, page],
  );
  const products = useProducts(params);
  const del = useDeleteProduct();

  const openFilter = (open: boolean) => {
    setFilterOpen(open);
    if (open) {
      setDraftQ(q);
      setDraftStatus(status);
      setDraftLifecycle(lifecycle);
    }
  };

  const applyFilters = () => {
    setQ(draftQ.trim());
    setStatus(draftStatus);
    setLifecycle(draftLifecycle);
    setPage(1); // a narrower result set makes the old page number meaningless
    setFilterOpen(false);
  };

  const resetDraft = () => {
    setDraftQ("");
    setDraftStatus("");
    setDraftLifecycle("");
  };

  const clearAll = () => {
    setQ("");
    setStatus("");
    setLifecycle("");
    setPage(1);
  };

  const filterChips = [
    q && {
      key: "q",
      label: t("products.search_label"),
      value: q,
      onRemove: () => setQ(""),
    },
    status && {
      key: "status",
      label: t("products.col.status"),
      value: t(`products.status.${status}`),
      onRemove: () => setStatus(""),
    },
    lifecycle && {
      key: "lifecycle",
      label: t("products.col.lifecycle"),
      value: t(`products.lifecycle.${lifecycle}`),
      onRemove: () => setLifecycle(""),
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    value: string;
    onRemove: () => void;
  }[];

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    del.mutate(target.id, {
      onSuccess: () => {
        toast.success(t("products.deleted", { name: target.name }));
        setDeleteTarget(null);
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  };

  const rows = products.data?.items ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        breadcrumbs={[{ labelKey: "nav.products" }]}
      />

      <ListToolbar
        onRefresh={() => void products.refetch()}
        refreshDisabled={products.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={openFilter}
            onApply={applyFilters}
            onReset={resetDraft}
            filterActive={filterChips.length > 0}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-q">{t("products.search_label")}</Label>
                <Input
                  id="product-q"
                  type="search"
                  value={draftQ}
                  placeholder={t("products.search_ph")}
                  onChange={(e) => setDraftQ(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-status">
                  {t("products.col.status")}
                </Label>
                <Select
                  inputId="product-status"
                  value={
                    draftStatus
                      ? {
                          value: draftStatus,
                          label: t(`products.status.${draftStatus}`),
                        }
                      : null
                  }
                  options={PRODUCT_STATUSES.map((s) => ({
                    value: s,
                    label: t(`products.status.${s}`),
                  }))}
                  isClearable
                  placeholder={t("common.all")}
                  onChange={(o) =>
                    setDraftStatus((o?.value as ProductStatus) ?? "")
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-lifecycle">
                  {t("products.col.lifecycle")}
                </Label>
                <Select
                  inputId="product-lifecycle"
                  value={
                    draftLifecycle
                      ? {
                          value: draftLifecycle,
                          label: t(`products.lifecycle.${draftLifecycle}`),
                        }
                      : null
                  }
                  options={PRODUCT_LIFECYCLES.map((l) => ({
                    value: l,
                    label: t(`products.lifecycle.${l}`),
                  }))}
                  isClearable
                  placeholder={t("common.all")}
                  onChange={(o) =>
                    setDraftLifecycle((o?.value as ProductLifecycle) ?? "")
                  }
                />
              </div>
            </div>
          </FilterPopover>
        }
      >
        {canCreate && (
          <Button type="button" onClick={() => navigate("/products/new")}>
            <Plus className="size-4" />
            {t("common.add_new")}
          </Button>
        )}
      </ListToolbar>

      <FilterChips
        items={filterChips}
        onClearAll={filterChips.length > 0 ? clearAll : undefined}
      />

      {products.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(products.error, t).message}
        />
      ) : products.isLoading && !products.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Table scroll={false} data-testid="products-table">
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
                  className="text-right"
                />
                <SortableHead
                  col="updated_at"
                  label={t("products.col.updated_at")}
                  sort={sort}
                  onSort={setSort}
                  className="text-right"
                />
                <TableHead className="text-right">
                  {t("products.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableEmpty colSpan={6} />}
              {rows.map((p) => (
                <TableRow key={p.id} data-testid="product-row">
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => navigate(`/products/${p.id}`)}
                    >
                      {p.name}
                    </button>
                    <div className="font-mono text-xs text-muted-foreground">
                      {p.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ProductStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>
                    <ProductLifecycleBadge lifecycle={p.lifecycle} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {p.released_at ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/products/${p.id}`)}
                      >
                        {t("common.edit")}
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(p)}
                        >
                          {t("common.delete")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            page={products.data?.page ?? 1}
            pageSize={products.data?.page_size ?? DEFAULT_PAGE_SIZE}
            total={products.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

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
