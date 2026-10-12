import { Mail, MessageSquare, Phone, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
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
import { formatDateTime } from "@/utils/format";

import { useDeleteLead, useLeads, useUpdateLead } from "../hooks/useLeads";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "../services/leads.service";

const STATUS_TONE: Record<LeadStatus, StatusTone> = {
  new: "neutral",
  contacted: "neutral",
  qualified: "warning",
  won: "success",
  lost: "danger",
};

// The pipeline. Status is editable inline because moving a lead along is the
// whole job here — making someone open a detail page to change one field would
// be friction with no payoff.
export default function LeadList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("crm.leads.manage");

  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [pending, setPending] = useState<Lead | null>(null);

  const list = useLeads({ q, status, source, page, page_size: DEFAULT_PAGE_SIZE });
  const update = useUpdateLead();
  const remove = useDeleteLead();

  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);

  const chips = [
    q && { key: "q", label: t("leads.search_label"), value: q, onRemove: () => setQ("") },
    status && {
      key: "status",
      label: t("leads.col.status"),
      value: t(`leads.status.${status}`),
      onRemove: () => setStatus(""),
    },
    source && {
      key: "source",
      label: t("leads.col.source"),
      value: t(`leads.source.${source}`),
      onRemove: () => setSource(""),
    },
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];

  return (
    <div className="space-y-3">
      <PageHeader title={t("leads.title")} subtitle={t("leads.subtitle")} />

      <ListToolbar
        onRefresh={() => void list.refetch()}
        refreshDisabled={list.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open);
              if (open) {
                setDraftQ(q);
                setDraftStatus(status);
                setDraftSource(source);
              }
            }}
            onApply={() => {
              setQ(draftQ.trim());
              setStatus(draftStatus);
              setSource(draftSource);
              setPage(1);
              setFilterOpen(false);
            }}
            onReset={() => {
              setDraftQ("");
              setDraftStatus("");
              setDraftSource("");
            }}
            filterActive={chips.length > 0}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-q">{t("leads.search_label")}</Label>
                <Input
                  id="lead-q"
                  type="search"
                  value={draftQ}
                  placeholder={t("leads.search_ph")}
                  onChange={(e) => setDraftQ(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-status">{t("leads.col.status")}</Label>
                <Select
                  inputId="lead-status"
                  isClearable
                  value={
                    draftStatus
                      ? { value: draftStatus, label: t(`leads.status.${draftStatus}`) }
                      : null
                  }
                  options={LEAD_STATUSES.map((s) => ({
                    value: s,
                    label: t(`leads.status.${s}`),
                  }))}
                  onChange={(o) => setDraftStatus(o?.value ?? "")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-source">{t("leads.col.source")}</Label>
                <Select
                  inputId="lead-source"
                  isClearable
                  value={
                    draftSource
                      ? { value: draftSource, label: t(`leads.source.${draftSource}`) }
                      : null
                  }
                  options={["chat", "form", "manual"].map((s) => ({
                    value: s,
                    label: t(`leads.source.${s}`),
                  }))}
                  onChange={(o) => setDraftSource(o?.value ?? "")}
                />
              </div>
            </div>
          </FilterPopover>
        }
      />

      <FilterChips
        items={chips}
        onClearAll={
          chips.length
            ? () => {
                setQ("");
                setStatus("");
                setSource("");
              }
            : undefined
        }
      />

      {list.isError ? (
        <Alert variant="danger" message={parseApiError(list.error, t).message} />
      ) : list.isLoading && !list.data ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Table scroll={false} data-testid="leads-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("leads.col.contact")}</TableHead>
                <TableHead>{t("leads.col.products")}</TableHead>
                <TableHead>{t("leads.col.assignee")}</TableHead>
                <TableHead>{t("leads.col.source")}</TableHead>
                <TableHead>{t("leads.col.status")}</TableHead>
                <TableHead className="text-right">{t("leads.col.created")}</TableHead>
                <TableHead className="text-right">{t("leads.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data?.items ?? []).length === 0 && <TableEmpty colSpan={7} />}
              {(list.data?.items ?? []).map((lead) => (
                <TableRow key={lead.id} data-testid="lead-row">
                  <TableCell>
                    <div className="font-medium">
                      {lead.name || t("leads.no_name")}
                    </div>
                    {/* Every channel the lead left, because which one works is
                        not something we know in advance. */}
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {lead.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.zalo && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {t("leads.channel_zalo")}
                        </span>
                      )}
                      {lead.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" />
                          {lead.email}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {lead.products.length
                      ? lead.products.map((p) => p.name).join(", ")
                      : "—"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {lead.assignee?.full_name ?? t("leads.unassigned")}
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {t(`leads.source.${lead.source}`)}
                    </span>
                    {lead.conversation_id && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-1 py-0 text-xs"
                        onClick={() => navigate("/chat")}
                      >
                        {t("leads.open_chat")}
                      </Button>
                    )}
                  </TableCell>

                  <TableCell>
                    {canManage ? (
                      <Select
                        inputId={`lead-status-${lead.id}`}
                        aria-label={t("leads.col.status")}
                        value={{
                          value: lead.status,
                          label: t(`leads.status.${lead.status}`),
                        }}
                        options={LEAD_STATUSES.map((s) => ({
                          value: s,
                          label: t(`leads.status.${s}`),
                        }))}
                        onChange={(o) =>
                          o &&
                          update.mutate(
                            { id: lead.id, body: { status: o.value as LeadStatus } },
                            {
                              onSuccess: () => toast.success(t("leads.status_saved")),
                              onError: fail,
                            },
                          )
                        }
                      />
                    ) : (
                      <StatusBadge tone={STATUS_TONE[lead.status]}>
                        {t(`leads.status.${lead.status}`)}
                      </StatusBadge>
                    )}
                  </TableCell>

                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(lead.created_at)}
                  </TableCell>

                  <TableCell className="text-right">
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                        onClick={() => setPending(lead)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            page={list.data?.page ?? 1}
            pageSize={list.data?.page_size ?? DEFAULT_PAGE_SIZE}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("leads.delete.title")}
        description={t("leads.delete.description")}
        confirmLabel={t("common.delete")}
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!pending) return;
          remove.mutate(pending.id, {
            onSuccess: () => {
              toast.success(t("leads.deleted"));
              setPending(null);
            },
            onError: fail,
          });
        }}
      />
    </div>
  );
}
