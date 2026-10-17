import {
  ArrowRight,
  Box,
  CalendarDays,
  CheckCheck,
  CircleHelp,
  Eye,
  FileText,
  Mail,
  MessageSquare,
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
import { RowAction, RowActions } from "@/components/common/RowActions";
import { Select } from "@/components/common/Select";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaging } from "@/hooks/usePaging";
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
import { LeadDetailDialog } from "../components/LeadDetailDialog";
import { NewsletterPanel } from "../components/NewsletterPanel";
import "@/styles/list-page.css";
import "./leads.css";

// The inbox reads its conversation off the URL, so a row hands the id over
// instead of dropping the operator on the unfiltered queue.
const inboxLink = (conversationId: string) =>
  `/chat?conversation=${encodeURIComponent(conversationId)}`;

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
  // Sign-ups live under the CMS permission, not a crm.* one: the opt-in
  // belongs to the site, and someone who manages leads is not automatically
  // allowed to read a mailing list.
  const canNewsletter = hasPermission("cms.newsletter.manage");
  const [tab, setTab] = useState<"leads" | "newsletter">("leads");
  // Page, page size and pager style all come from the shared settings
  // (Settings → General → Pagination), so every list pages the same way.
  const paging = usePaging();
  const { page, setPage } = paging;
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [pending, setPending] = useState<Lead | null>(null);
  const [viewing, setViewing] = useState<Lead | null>(null);
  const list = useLeads({
    q,
    status,
    source,
    assignee,
    page,
    page_size: paging.pageSize,
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
          isSearchable={false}
          isClearable={false}
          isDisabled={update.isPending}
          value={{
            value: lead.status,
            label: t(`leads.status.${lead.status}`),
          }}
          options={LEAD_STATUSES.map((value) => ({
            value,
            label: t(`leads.status.${value}`),
          }))}
          onChange={(option) =>
            option &&
            update.mutate(
              { id: lead.id, body: { status: option.value as LeadStatus } },
              {
                onSuccess: () => toast.success(t("leads.status_saved")),
                onError: fail,
              },
            )
          }
        />
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
          <button
            type="button"
            onClick={() => navigate(inboxLink(lead.conversation_id as string))}
          >
            <span>{t("leads.open_chat")}</span>
            <ArrowRight className="size-3" aria-hidden />
          </button>
        )}
      </div>
    );
  };
  // Viewing is always offered: anyone who can see the row can see what the
  // customer wrote, and the message is the one field the table has no column
  // for. The other two actions stay permission-gated.
  const actions = (lead: Lead) => (
    <RowActions>
      <RowAction
        icon={Eye}
        label={t("leads.detail.open")}
        onClick={() => setViewing(lead)}
      />
      {lead.conversation_id && canChat && (
        <RowAction
          icon={MessageSquare}
          label={t("leads.open_chat")}
          onClick={() => navigate(inboxLink(lead.conversation_id as string))}
        />
      )}
      {canManage && (
        <RowAction
          destructive
          icon={Trash2}
          label={t("common.delete")}
          onClick={() => setPending(lead)}
        />
      )}
    </RowActions>
  );

  return (
    <div className="list-page" data-list="leads">
      <PageHeader
        title={t("leads.title")}
        subtitle={t("leads.subtitle")}
        breadcrumbs={[{ labelKey: "nav.leads" }]}
      />

      {/* Two lists, one screen: people who asked to be contacted, and people
          who only gave an address for the newsletter. They are kept apart so
          nobody gets a sales call off a mailing-list sign-up. */}
      {canNewsletter && (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "leads" | "newsletter")}
        >
          <TabsList>
            <TabsTrigger value="leads">{t("leads.tabs.leads")}</TabsTrigger>
            <TabsTrigger value="newsletter">
              {t("leads.tabs.newsletter")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {tab === "newsletter" && canNewsletter ? (
        <NewsletterPanel canManage={canNewsletter} />
      ) : (
        <>
          <div className="list-overview" aria-label={t("leads.overview.label")}>
            {OVERVIEW.map(({ status: value, key, Icon }, index) => (
              <button
                type="button"
                key={key}
                className="list-metric"
                data-kind={key}
                aria-pressed={value ? status === value : !hasFilters}
                onClick={() => (value ? setStage(value) : reset())}
              >
                <span className="list-metric-top">
                  <span>{t(`leads.overview.${key}`)}</span>
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
                  {t(`leads.overview.${key}_hint`)}
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </button>
            ))}
          </div>

          <section className="list-panel" aria-label={t("leads.list_title")}>
            <div className="list-panel-heading">
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
            <div className="list-toolbar">
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
              <div className="list-filter-controls">
                {/* "All" is the cleared state, not an option in the list: the theme
                select already offers a ✕, and keeping both would give two ways
                to say the same thing. */}
                <div className="list-filter-select">
                  <Select
                    inputId="lead-filter-source"
                    aria-label={t("leads.col.source")}
                    isSearchable={false}
                    placeholder={t("leads.all_sources")}
                    value={
                      source
                        ? { value: source, label: t(`leads.source.${source}`) }
                        : null
                    }
                    options={["chat", "form", "manual"].map((value) => ({
                      value,
                      label: t(`leads.source.${value}`),
                    }))}
                    onChange={(option) => {
                      setSource(option?.value ?? "");
                      setPage(1);
                    }}
                  />
                </div>
                <div className="list-filter-select">
                  <Select
                    inputId="lead-filter-assignee"
                    aria-label={t("leads.col.assignee")}
                    isSearchable={false}
                    placeholder={t("leads.all_owners")}
                    value={
                      assignee
                        ? { value: assignee, label: t("leads.unassigned") }
                        : null
                    }
                    options={[
                      { value: "unassigned", label: t("leads.unassigned") },
                    ]}
                    onChange={(option) => {
                      setAssignee(option?.value ?? "");
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              className="list-tabs"
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
              className="list-filter-chips"
              items={chips}
              onClearAll={chips.length ? reset : undefined}
            />
            {list.isError ? (
              <div className="list-error">
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
                      <Users className="size-5" />
                    </span>
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                    <UserPlus className="list-empty-plus" />
                  </div>
                </div>
                <h3>
                  {t(hasFilters ? "leads.no_results" : "leads.empty_title")}
                </h3>
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
                <div className="list-desktop">
                  <Table
                    scroll={false}
                    data-testid="leads-table"
                    wrapperClassName="list-table-wrap"
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
                <div className="list-mobile">
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
              total={list.data?.total ?? 0}
              loading={list.isFetching}
            />
          </div>
        </>
      )}
      <LeadDetailDialog
        lead={viewing}
        onClose={() => setViewing(null)}
        status={viewing ? stageControl(viewing) : null}
        source={viewing ? sourceBadge(viewing) : null}
        canChat={canChat}
      />
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
