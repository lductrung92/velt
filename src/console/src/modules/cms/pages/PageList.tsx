import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { PageStatusBadge } from "../components/PageStatusBadge";
import { useDeletePage, usePages } from "../hooks/useCmsPages";
import type { PageNode } from "../services/pages.service";

function flatten(
  nodes: PageNode[],
  depth = 0,
): { node: PageNode; depth: number }[] {
  return nodes.flatMap((n) => [
    { node: n, depth },
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
  const rows = flatten(pagesQuery.data ?? []);
  const [toDelete, setToDelete] = useState<PageNode | null>(null);

  function openCreate() {
    navigate("/cms/pages/new");
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

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("cms.pages.title")}
        subtitle={t("cms.pages.subtitle")}
        breadcrumbs={[{ labelKey: "nav.cms_pages" }]}
      />

      <ListToolbar
        onRefresh={() => void pagesQuery.refetch()}
        refreshDisabled={pagesQuery.isFetching}
      >
        {canCreate && (
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            {t("common.add_new")}
          </Button>
        )}
      </ListToolbar>

      {pagesQuery.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(pagesQuery.error, t).message}
        />
      ) : pagesQuery.isLoading && !pagesQuery.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <Table scroll={false} data-testid="cms-pages-table">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[12rem]">
                {t("cms.pages.field.title")}
              </TableHead>
              <TableHead>{t("cms.pages.field.slug")}</TableHead>
              <TableHead>{t("cms.pages.field.status")}</TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableEmpty colSpan={4} />}
            {rows.map(({ node, depth }) => (
              <TableRow key={node.id}>
                <TableCell>
                  <span
                    className="inline-flex items-center gap-2"
                    style={{ paddingLeft: depth * 16 }}
                  >
                    <Link
                      to={`/cms/pages/${node.id}`}
                      className="font-medium hover:underline"
                    >
                      {node.title}
                    </Link>
                    {node.landing_id && (
                      <Badge variant="secondary">
                        {t("cms.pages.badge.landing")}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  /{node.slug}
                </TableCell>
                <TableCell>
                  <PageStatusBadge status={node.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        to={`/cms/pages/${node.id}`}
                        aria-label={t("common.edit")}
                      >
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
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
