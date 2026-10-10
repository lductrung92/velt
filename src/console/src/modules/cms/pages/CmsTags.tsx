import { GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
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

import { TagFormDialog } from "../components/TagFormDialog";
import { TagMergeDialog } from "../components/TagMergeDialog";
import { useDeleteTag, useTagOptions, useTags } from "../hooks/useCmsTags";
import type { Tag } from "../services/tags.service";

interface Option {
  value: string;
  label: string;
}

export default function CmsTags() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("cms.taxonomy.manage");

  const [page, setPage] = useState(1);
  // Sort: 3-state cycle per column (idle → asc → desc → idle); idle falls back
  // to the server default (name ASC).
  const [sort, setSort] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tag | null>(null);
  const [mergeSource, setMergeSource] = useState<Tag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const del = useDeleteTag();

  // Server-side pagination (cms-api §5): the table fetches one page, filtered by
  // q on the backend. The merge-target picker needs the FULL set, so it pulls
  // the lightweight options list separately.
  const tags = useTags({
    page,
    page_size: DEFAULT_PAGE_SIZE,
    q: q || undefined,
    sort: sort ?? undefined,
  });
  const tagOptions = useTagOptions();

  const handleSort = (next: string | null) => {
    setSort(next);
    setPage(1);
  };

  const SortHead = ({ col, label }: { col: string; label: string }) => (
    <SortableHead col={col} label={label} sort={sort} onSort={handleSort} />
  );

  const items = tags.data?.items ?? [];
  const total = tags.data?.total ?? 0;

  const mergeTargetOptions: Option[] = (tagOptions.data ?? [])
    .filter((tg) => tg.id !== mergeSource?.id)
    .map((tg) => ({ value: tg.id, label: tg.name }));

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }
  function openEdit(tg: Tag) {
    setEditTarget(tg);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast.success(t("cms.tags.toast.delete_success"));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(parseApiError(err, t).message);
    }
  }

  const filtersActive = q !== "";

  function handleFilterOpenChange(next: boolean) {
    if (next) setDraftQ(q);
    setFilterOpen(next);
  }
  function applyFilters() {
    setQ(draftQ.trim());
    setPage(1);
    setFilterOpen(false);
  }
  function clearAllFilters() {
    setQ("");
    setPage(1);
  }

  const filterChips: FilterChip[] = q
    ? [
        {
          key: "q",
          label: t("cms.tags.search_label"),
          value: q,
          onRemove: () => {
            setQ("");
            setPage(1);
          },
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("cms.tags.title")}
        subtitle={t("cms.tags.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_tags" }]}
      />

      <ListToolbar
        onRefresh={() => void tags.refetch()}
        refreshDisabled={tags.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={handleFilterOpenChange}
            onApply={applyFilters}
            onReset={() => setDraftQ("")}
            filterActive={filtersActive}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cms-tag-q">{t("cms.tags.search_label")}</Label>
              <Input
                id="cms-tag-q"
                type="search"
                value={draftQ}
                placeholder={t("cms.tags.search_ph")}
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
        onClearAll={filtersActive ? clearAllFilters : undefined}
      />

      {tags.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(tags.error, t).message}
        />
      ) : tags.isLoading && !tags.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Table scroll={false}>
            <TableHeader>
              <TableRow>
                <SortHead col="name" label={t("cms.tags.col.name")} />
                <SortHead col="slug" label={t("cms.tags.col.slug")} />
                <SortableHead
                  col="usage"
                  label={t("cms.tags.col.usage")}
                  sort={sort}
                  onSort={handleSort}
                  className="text-right"
                />
                <TableHead className="text-right">
                  {t("cms.tags.col.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && <TableEmpty colSpan={4} />}
              {items.map((tg) => (
                <TableRow key={tg.id}>
                  <TableCell className="font-medium">{tg.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {tg.slug}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {tg.usage_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                          onClick={() => openEdit(tg)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("cms.tags.btn.merge")}
                          title={t("cms.tags.btn.merge")}
                          onClick={() => setMergeSource(tg)}
                        >
                          <GitMerge className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                          onClick={() => setDeleteTarget(tg)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            total={total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <TagFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tag={editTarget}
      />
      <TagMergeDialog
        open={!!mergeSource}
        onOpenChange={(open) => !open && setMergeSource(null)}
        source={mergeSource}
        targetOptions={mergeTargetOptions}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("cms.tags.dialog.delete.title")}
        description={t("cms.tags.dialog.delete.description", {
          count: deleteTarget?.usage_count ?? 0,
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
