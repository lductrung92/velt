import {
  ArrowRight,
  GitMerge,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
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

import "@/styles/list-page.css";
import "./tags.css";

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

  const items = tags.data?.items ?? [];
  const total = tags.data?.total ?? 0;

  const mergeTargetOptions: Option[] = (tagOptions.data ?? [])
    .filter((tg) => tg.id !== mergeSource?.id)
    .map((tg) => ({ value: tg.id, label: tg.name }));

  function openCreate() {
    setEditTarget(null);
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

  const actions = (tg: Tag) =>
    canManage && (
      <div className="tag-row-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => {
            setEditTarget(tg);
            setFormOpen(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("cms.tags.btn.merge")}
          title={t("cms.tags.btn.merge")}
          onClick={() => setMergeSource(tg)}
        >
          <GitMerge className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
          title={t("common.delete")}
          onClick={() => setDeleteTarget(tg)}
        >
          <Trash2 className="size-4 text-destructive-ink" />
        </Button>
      </div>
    );

  const usage = (tg: Tag) => (
    <span
      className="tag-usage"
      data-empty={tg.usage_count === 0 ? "true" : "false"}
    >
      {t("cms.tags.usage_count", { count: tg.usage_count })}
    </span>
  );

  return (
    <div className="list-page" data-list="tags">
      <PageHeader
        title={t("cms.tags.title")}
        subtitle={t("cms.tags.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_tags" }]}
      />

      {/* No overview row: the figures worth showing here are "in use" and
          "unused", and the tag API offers neither a usage filter nor usage on
          the full-set endpoint. Sorting by usage already surfaces the unused
          ones, so inventing numbers the server cannot back would be worse than
          leaving the row out. */}

      <section className="list-panel" aria-label={t("cms.tags.list_title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("cms.tags.list_title")}</h2>
            <p>
              {tags.isPending || tags.isError
                ? t("cms.tags.list_hint")
                : t("cms.tags.record_count", { count: total })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={tags.isFetching}
              onClick={() => void tags.refetch()}
            >
              <RotateCcw
                className={
                  tags.isFetching
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden
              />
              {t("common.refresh")}
            </Button>
            {canManage && (
              <Button type="button" size="sm" onClick={openCreate}>
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
              aria-label={t("cms.tags.search_label")}
              placeholder={t("cms.tags.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                // Clearing the box clears the applied search too; the list is
                // paginated on the server, so every keystroke is not a request.
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
              aria-label={t("cms.tags.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

        {tags.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(tags.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void tags.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : tags.isPending ? (
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
                  <TagIcon className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <Plus className="list-empty-plus" />
              </div>
            </div>
            <h3>{t(q ? "cms.tags.no_results" : "cms.tags.empty_title")}</h3>
            <p>{t(q ? "cms.tags.no_results_hint" : "cms.tags.empty_hint")}</p>
            {!q && canManage && (
              <Button size="sm" onClick={openCreate}>
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
                data-testid="cms-tags-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      col="name"
                      label={t("cms.tags.col.name")}
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHead
                      col="slug"
                      label={t("cms.tags.col.slug")}
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHead
                      col="usage"
                      label={t("cms.tags.col.usage")}
                      sort={sort}
                      onSort={handleSort}
                    />
                    <TableHead className="text-right">
                      {t("cms.tags.col.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((tg) => (
                    <TableRow key={tg.id} data-testid="cms-tag-row">
                      <TableCell>
                        <span className="tag-name">
                          <TagIcon className="size-3.5" aria-hidden />
                          <strong>{tg.name}</strong>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="tag-slug">{tg.slug}</span>
                      </TableCell>
                      <TableCell>{usage(tg)}</TableCell>
                      <TableCell className="text-right">
                        {actions(tg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile">
              {items.map((tg) => (
                <div className="tag-mobile-card" key={tg.id}>
                  <div className="tag-mobile-heading">
                    <span className="tag-name">
                      <TagIcon className="size-3.5" aria-hidden />
                      <strong>{tg.name}</strong>
                    </span>
                    {actions(tg)}
                  </div>
                  <div className="tag-mobile-meta">
                    {usage(tg)}
                    <span className="tag-slug">{tg.slug}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="list-pagination">
              <TablePagination
                page={page}
                total={total}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </section>

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
