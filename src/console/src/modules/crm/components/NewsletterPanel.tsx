import { Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { Select } from "@/components/common/Select";
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
import { parseApiError } from "@/utils/apiError";

import { useDeleteSubscriber, useSubscribers } from "../hooks/useNewsletter";
import type {
  Subscriber,
  SubscriberStatus,
} from "../services/newsletter.service";

/**
 * Newsletter sign-ups, as a tab beside the lead list.
 *
 * These are not leads and are deliberately not shown as such: a lead is
 * somebody who asked to be contacted, while this is an address given for one
 * purpose only. Merging the two lists would make it easy to call someone who
 * never asked to be called.
 *
 * There is no edit here, only delete — an address is a fact the visitor
 * supplied, not a record to curate. Delete exists because "remove me" has to
 * be answerable.
 */
export function NewsletterPanel({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const paging = usePaging();
  const { page, pageSize, setPage } = paging;
  const [status, setStatus] = useState<SubscriberStatus>("");
  const [pending, setPending] = useState<Subscriber | null>(null);

  const list = useSubscribers(
    { status: status || undefined, page, page_size: pageSize },
    canManage,
  );
  const remove = useDeleteSubscriber();

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(
      i18n.language === "en" ? "en-GB" : "vi-VN",
      { day: "2-digit", month: "2-digit", year: "numeric" },
    );

  const rows = list.data?.items ?? [];

  return (
    <>
      <section
        className="list-panel"
        aria-label={t("leads.newsletter.list_title")}
      >
        <div className="list-panel-heading">
          <div>
            <h2>{t("leads.newsletter.list_title")}</h2>
            <p>
              {list.isPending || list.isError
                ? t("leads.newsletter.hint")
                : t("leads.newsletter.count", { count: list.data?.total ?? 0 })}
            </p>
          </div>
        </div>

        <div className="list-toolbar">
          <div className="list-filter-controls">
            <div className="list-filter-select">
              <Select
                inputId="newsletter-filter-status"
                aria-label={t("leads.newsletter.col.status")}
                isSearchable={false}
                placeholder={t("leads.newsletter.all_statuses")}
                value={
                  status
                    ? {
                        value: status,
                        label: t(`leads.newsletter.status_${status}`),
                      }
                    : null
                }
                options={["active", "unsubscribed"].map((value) => ({
                  value,
                  label: t(`leads.newsletter.status_${value}`),
                }))}
                onChange={(option) => {
                  setStatus((option?.value ?? "") as SubscriberStatus);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {list.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(list.error, t).message}
            />
          </div>
        ) : list.isPending ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="list-empty">
            <div className="list-empty-art" aria-hidden="true">
              <span className="list-empty-icon">
                <Mail className="size-5" />
              </span>
            </div>
            <h3>{t("leads.newsletter.empty_title")}</h3>
            <p>{t("leads.newsletter.empty_description")}</p>
          </div>
        ) : (
          <div className="list-desktop">
            <Table
              scroll={false}
              data-testid="newsletter-table"
              wrapperClassName="list-table-wrap"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>{t("leads.newsletter.col.email")}</TableHead>
                  <TableHead>{t("leads.newsletter.col.source")}</TableHead>
                  <TableHead>{t("leads.newsletter.col.status")}</TableHead>
                  <TableHead>{t("leads.newsletter.col.created")}</TableHead>
                  <TableHead className="text-right">
                    {t("leads.newsletter.col.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>
                      {row.source_key || t("leads.newsletter.source_unknown")}
                    </TableCell>
                    <TableCell>
                      {t(
                        row.unsubscribed_at
                          ? "leads.newsletter.status_unsubscribed"
                          : "leads.newsletter.status_active",
                      )}
                    </TableCell>
                    <TableCell>{when(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <RowActions>
                        <RowAction
                          icon={Trash2}
                          label={t("leads.newsletter.delete")}
                          destructive
                          onClick={() => setPending(row)}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <div className="list-pagination">
        <ListPager
          paging={paging}
          total={list.data?.total ?? 0}
          loading={list.isFetching}
        />
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("leads.newsletter.delete")}
        description={t("leads.newsletter.delete_confirm", {
          email: pending?.email ?? "",
        })}
        confirmLabel={t("common.delete")}
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!pending) return;
          remove.mutate(pending.id, {
            onSuccess: () => {
              toast.success(t("leads.newsletter.deleted"));
              setPending(null);
            },
            onError: (err) => toast.error(parseApiError(err, t).message),
          });
        }}
      />
    </>
  );
}
