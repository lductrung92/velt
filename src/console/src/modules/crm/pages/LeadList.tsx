import {
  ArrowRight,
  Box,
  CalendarDays,
  CheckCheck,
  CircleHelp,
  FileText,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

import {
  useDeleteLead,
  useLeadOverview,
  useLeads,
  useUpdateLead,
} from "../hooks/useLeads";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "../services/leads.service";
import "./leads.css";

const OVERVIEW = [
  { status: "", key: "total", Icon: Users },
  { status: "new", key: "new", Icon: UserPlus },
  { status: "qualified", key: "qualified", Icon: Sparkles },
  { status: "won", key: "won", Icon: CheckCheck },
];

function LeadAvatar({
  name,
  status,
}: {
  name: string | null;
  status?: LeadStatus;
}) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <span className="lead-avatar" data-status={status} aria-hidden>
      {initials || <Users className="size-4" />}
    </span>
  );
}

function LeadContact({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  return (
    <div className="lead-contact">
      <LeadAvatar name={lead.name} status={lead.status} />
      <div className="lead-contact-info">
        <strong>{lead.name || t("leads.no_name")}</strong>
        <div className="lead-contact-channels">
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>
              <Phone className="size-3" aria-hidden />
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`}>
              <Mail className="size-3" aria-hidden />
              <span>{lead.email}</span>
            </a>
          )}
          {lead.zalo && (
            <span title={lead.zalo}>
              <MessageSquare className="size-3" aria-hidden />
              {t("leads.channel_zalo")}: {lead.zalo}
            </span>
          )}
        </div>
        {lead.note && (
          <p className="lead-note" title={lead.note}>
            {lead.note}
          </p>
        )}
      </div>
    </div>
  );
}

function LeadProducts({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  return lead.products.length ? (
    <div className="lead-products">
      {lead.products.map((p) => (
        <span key={p.id} title={p.name}>
          <Box className="size-3 shrink-0" aria-hidden />
          {p.name}
        </span>
      ))}
    </div>
  ) : (
    <span className="lead-muted">{t("leads.no_products")}</span>
  );
}

export default function LeadList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("crm.leads.manage");
  const canChat = hasPermission("ai.chat.handle");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [pending, setPending] = useState<Lead | null>(null);
  const list = useLeads({
    q,
    status,
    source,
    assignee,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  });
  const overview = useLeadOverview(hasPermission("crm.leads.view_all"));
  const update = useUpdateLead();
  const remove = useDeleteLead();
  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);
  const setStage = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  const reset = () => {
    setQ("");
    setDraftQ("");
    setStatus("");
    setSource("");
    setAssignee("");
    setPage(1);
  };
  const hasFilters = !!(q || status || source || assignee);
  const chips: FilterChip[] = [];
  if (q)
    chips.push({
      key: "q",
      label: t("leads.search_label"),
      value: q,
      onRemove: () => {
        setQ("");
        setDraftQ("");
        setPage(1);
      },
    });
  if (source)
    chips.push({
      key: "source",
      label: t("leads.col.source"),
      value: t(`leads.source.${source}`),
      onRemove: () => {
        setSource("");
        setPage(1);
      },
    });
  if (assignee)
    chips.push({
      key: "assignee",
      label: t("leads.col.assignee"),
      value: t("leads.unassigned"),
      onRemove: () => {
        setAssignee("");
        setPage(1);
      },
    });
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const rows = list.data?.items ?? [];

  const stageControl = (lead: Lead) => (
    <span className="lead-stage" data-status={lead.status}>
      {canManage ? (
        <Select
          aria-label={t("leads.change_status", {
            name: lead.name || t("leads.no_name"),
          })}
          value={lead.status}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              {
                id: lead.id,
                body: { status: event.target.value as LeadStatus },
              },
              {
                onSuccess: () => toast.success(t("leads.status_saved")),
                onError: fail,
              },
            )
          }
        >
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`leads.status.${value}`)}
            </option>
          ))}
        </Select>
      ) : (
        <span>{t(`leads.status.${lead.status}`)}</span>
      )}
    </span>
  );
  const owner = (lead: Lead) => (
    <span className="lead-owner">
      {lead.assignee ? (
        <>
          <LeadAvatar name={lead.assignee.full_name} />
          <span>{lead.assignee.full_name}</span>
        </>
      ) : (
        <span className="lead-unassigned">
          <CircleHelp className="size-3.5" aria-hidden />
          {t("leads.unassigned")}
        </span>
      )}
    </span>
  );
  const sourceBadge = (lead: Lead) => {
    const Icon =
      lead.source === "chat"
        ? MessageSquare
        : lead.source === "form"
          ? FileText
          : UserPlus;
    return (
      <div className="lead-source">
        <span>
          <Icon className="size-3.5" aria-hidden />
          {t(`leads.source.${lead.source}`)}
        </span>
        {lead.conversation_id && canChat && (
          <button type="button" onClick={() => navigate("/chat")}>
            <span>{t("leads.open_chat")}</span>
            <ArrowRight className="size-3" aria-hidden />
          </button>
        )}
      </div>
    );
  };
  const actions = (lead: Lead) =>
    (canManage || (lead.conversation_id && canChat)) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("leads.actions_for", {
              name: lead.name || t("leads.no_name"),
            })}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {lead.conversation_id && canChat && (
            <DropdownMenuItem onSelect={() => navigate("/chat")}>
              <MessageSquare />
              {t("leads.open_chat")}
            </DropdownMenuItem>
          )}
          {lead.conversation_id && canChat && canManage && (
            <DropdownMenuSeparator />
          )}
          {canManage && (
            <DropdownMenuItem destructive onSelect={() => setPending(lead)}>
              <Trash2 />
              {t("common.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <div className="leads-page">
      <PageHeader title={t("leads.title")} subtitle={t("leads.subtitle")} />
      <div className="leads-overview" aria-label={t("leads.overview.label")}>
        {OVERVIEW.map(({ status: value, key, Icon }, index) => (
          <button
            type="button"
            key={key}
            className="leads-metric"
            data-kind={key}
            aria-pressed={value ? status === value : !hasFilters}
            onClick={() => (value ? setStage(value) : reset())}
          >
            <span className="leads-metric-top">
              <span>{t(`leads.overview.${key}`)}</span>
              <span className="leads-metric-icon">
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
            <span className="leads-metric-bottom">
              {t(`leads.overview.${key}_hint`)}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <section className="leads-panel" aria-label={t("leads.list_title")}>
        <div className="leads-panel-heading">
          <div>
            <h2>{t("leads.list_title")}</h2>
            <p>
              {list.isPending || list.isError
                ? t("leads.list_hint")
                : t("leads.record_count", { count: list.data?.total ?? 0 })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={list.isFetching}
            onClick={() => {
              void list.refetch();
              overview.forEach((query) => void query.refetch());
            }}
          >
            <RotateCcw
              className={
                list.isFetching
                  ? "size-3.5 animate-spin motion-reduce:animate-none"
                  : "size-3.5"
              }
              aria-hidden
            />
            {t("common.refresh")}
          </Button>
        </div>
        <div className="leads-toolbar">
          <form
            className="leads-search"
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
              aria-label={t("leads.search_label")}
              placeholder={t("leads.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
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
              aria-label={t("leads.apply_search")}
              title={t("leads.apply_search")}
            >
              <ArrowRight className="size-4" />
            </Button>
          </form>
          <div className="leads-filter-controls">
            <Select
              value={source}
              aria-label={t("leads.col.source")}
              onChange={(event) => {
                setSource(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("leads.all_sources")}</option>
              {["chat", "form", "manual"].map((value) => (
                <option value={value} key={value}>
                  {t(`leads.source.${value}`)}
                </option>
              ))}
            </Select>
            <Select
              value={assignee}
              aria-label={t("leads.col.assignee")}
              onChange={(event) => {
                setAssignee(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("leads.all_owners")}</option>
              <option value="unassigned">{t("leads.unassigned")}</option>
            </Select>
          </div>
        </div>
        <div
          className="leads-tabs"
          role="group"
          aria-label={t("leads.filter_status")}
        >
          <button
            type="button"
            aria-pressed={!status}
            onClick={() => setStage("")}
          >
            {t("leads.all_statuses")}
          </button>
          {LEAD_STATUSES.map((value) => (
            <button
              type="button"
              key={value}
              data-status={value}
              aria-pressed={status === value}
              onClick={() => setStage(value)}
            >
              <i aria-hidden />
              {t(`leads.status.${value}`)}
            </button>
          ))}
        </div>
        <FilterChips
          className="leads-filter-chips"
          items={chips}
          onClearAll={chips.length ? reset : undefined}
        />
        {list.isError ? (
          <div className="leads-error">
            <Alert
              variant="danger"
              message={parseApiError(list.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : list.isPending ? (
          <div className="leads-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="leads-empty">
            <div className="leads-empty-art" aria-hidden>
              <span className="leads-empty-ring" />
              <div className="leads-empty-card">
                <span>
                  <Users className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <UserPlus className="leads-empty-plus" />
              </div>
            </div>
            <h3>{t(hasFilters ? "leads.no_results" : "leads.empty_title")}</h3>
            <p>
              {t(
                hasFilters
                  ? "leads.no_results_hint"
                  : "leads.empty_description",
              )}
            </p>
            {hasFilters ? (
              <Button size="sm" variant="outline" onClick={reset}>
                <X className="size-3.5" />
                {t("leads.reset_filters")}
              </Button>
            ) : (
              canChat && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/chat")}
                >
                  <MessageSquare className="size-3.5" />
                  {t("leads.open_chat")}
                </Button>
              )
            )}
          </div>
        ) : (
          <>
            <div className="leads-desktop">
              <Table
                scroll={false}
                data-testid="leads-table"
                wrapperClassName="leads-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leads.col.contact")}</TableHead>
                    <TableHead>{t("leads.col.products")}</TableHead>
                    <TableHead>{t("leads.col.assignee")}</TableHead>
                    <TableHead>{t("leads.col.source")}</TableHead>
                    <TableHead>{t("leads.col.status")}</TableHead>
                    <TableHead>{t("leads.col.created")}</TableHead>
                    <TableHead className="text-right">
                      {t("leads.col.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((lead) => (
                    <TableRow key={lead.id} data-testid="lead-row">
                      <TableCell>
                        <LeadContact lead={lead} />
                      </TableCell>
                      <TableCell>
                        <LeadProducts lead={lead} />
                      </TableCell>
                      <TableCell>{owner(lead)}</TableCell>
                      <TableCell>{sourceBadge(lead)}</TableCell>
                      <TableCell>{stageControl(lead)}</TableCell>
                      <TableCell>
                        <span className="lead-created">
                          <strong>{formatDate(lead.created_at)}</strong>
                          <span>{formatTime(lead.created_at)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {actions(lead)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="leads-mobile">
              {rows.map((lead) => (
                <article
                  key={lead.id}
                  className="lead-mobile-card"
                  data-testid="lead-card"
                >
                  <div className="lead-mobile-heading">
                    <LeadContact lead={lead} />
                    {actions(lead)}
                  </div>
                  <div className="lead-mobile-stage">
                    {stageControl(lead)}
                    {sourceBadge(lead)}
                  </div>
                  <div className="lead-mobile-products">
                    <span>{t("leads.col.products")}</span>
                    <LeadProducts lead={lead} />
                  </div>
                  <div className="lead-mobile-footer">
                    {owner(lead)}
                    <span>
                      <CalendarDays className="size-3.5" aria-hidden />
                      {formatDate(lead.created_at)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <div className="leads-pagination">
              <TablePagination
                page={list.data?.page ?? page}
                pageSize={list.data?.page_size ?? DEFAULT_PAGE_SIZE}
                total={list.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </section>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.name
            ? t("leads.delete.named_title", { name: pending.name })
            : t("leads.delete.title")
        }
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
              setPage(1);
            },
            onError: fail,
          });
        }}
      />
    </div>
  );
}
