import {
  LogOut,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { RowAction, RowActions } from "@/components/common/RowActions";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserAgentBadge } from "@/components/common/UserAgentBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { formatDateTime } from "@/utils/format";

import { CleanupDialog } from "../components/CleanupDialog";
import { useRevokeSession, useSessions } from "../hooks/useAdminSessions";
import { usePurgeSessions } from "../hooks/usePurge";
import type { AdminSession } from "../services/admin.service";

import "@/styles/list-page.css";

export default function Sessions() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canRevoke = hasPermission("sessions.revoke");

  const [activeOnly, setActiveOnly] = useState(true);
  // Page, page size and pager style all come from the shared settings
  // (Settings → General → Pagination), so every list pages the same way.
  const paging = usePaging();
  const { page, setPage } = paging;
  useEffect(() => setPage(1), [activeOnly, setPage]);

  const sessions = useSessions({
    active: activeOnly,
    page,
    page_size: paging.pageSize,
  });
  const revoke = useRevokeSession();
  const purge = usePurgeSessions();
  const [cleaning, setCleaning] = useState(false);
  const [target, setTarget] = useState<AdminSession | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function runRevoke() {
    if (!target) return;
    setConfirmError(null);
    revoke.mutate(target.id, {
      onSuccess: () => {
        toast.success(t("admin.sessions.revoked"));
        setTarget(null);
      },
      onError: (err) => {
        const p = parseApiError(err, t);
        // Already revoked / gone → idempotent, treat as done.
        if (p.code === 404) {
          toast.success(t("admin.sessions.revoked"));
          setTarget(null);
        } else {
          setConfirmError(p.message);
        }
      },
    });
  }

  const items = sessions.data?.items ?? [];

  const revokeDescription = target
    ? target.is_last_super_admin
      ? t("admin.sessions.revoke_last_super_admin_warn")
      : target.current
        ? t("admin.sessions.revoke_current_warn")
        : t("admin.sessions.revoke_confirm")
    : "";

  // The former "Trạng thái" column only ever filled in for the viewer's own
  // session and was blank on every other row, so the badge rides along with the
  // identity it describes and the column is gone.
  const identity = (s: AdminSession) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{s.full_name}</span>
        {s.current && (
          <StatusBadge tone="success">
            {t("admin.sessions.current")}
          </StatusBadge>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">{s.email}</span>
    </div>
  );

  const revokeButton = (s: AdminSession) => (
    <RowActions>
      <RowAction
        destructive
        icon={LogOut}
        label={t("admin.sessions.revoke")}
        onClick={() => {
          setConfirmError(null);
          setTarget(s);
        }}
      />
    </RowActions>
  );

  return (
    <div className="list-page" data-list="admin-sessions">
      <PageHeader
        title={t("admin.sessions.title")}
        subtitle={t("admin.sessions.subtitle")}
        breadcrumbs={[{ labelKey: "nav.sessions" }]}
      />

      <section className="list-panel" aria-label={t("admin.sessions.title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("admin.sessions.list_title")}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canRevoke && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setCleaning(true)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                {t("admin.sessions.cleanup")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={sessions.isFetching}
              onClick={() => void sessions.refetch()}
            >
              <RotateCcw
                className={
                  sessions.isFetching
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden
              />
              {t("common.refresh")}
            </Button>
          </div>
        </div>

        {/* No status axis here, so no tabs row — the toolbar carries the rule
            that would otherwise come from it. */}
        <div className="list-toolbar list-toolbar-edge">
          <div className="list-filter-controls">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
              {t("admin.sessions.active_only")}
            </label>
          </div>
        </div>

        {sessions.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(sessions.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void sessions.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : sessions.isLoading && !sessions.data ? (
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
                  <MonitorSmartphone className="size-5" />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <Plus className="list-empty-plus" />
              </div>
            </div>
            <h3>{t("admin.sessions.empty_title")}</h3>
            <p>{t("admin.sessions.empty_hint")}</p>
          </div>
        ) : (
          <>
            <div className="list-desktop">
              <Table
                scroll={false}
                data-testid="admin-sessions-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.sessions.col.user")}</TableHead>
                    <TableHead>{t("admin.sessions.col.device")}</TableHead>
                    <TableHead>{t("admin.sessions.col.ip")}</TableHead>
                    <TableHead>{t("admin.sessions.col.created")}</TableHead>
                    <TableHead>{t("admin.sessions.col.last_used")}</TableHead>
                    <TableHead>{t("admin.sessions.col.expires")}</TableHead>
                    {canRevoke && (
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">
                          {t("admin.sessions.col.actions")}
                        </span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{identity(s)}</TableCell>
                      <TableCell>
                        <UserAgentBadge ua={s.user_agent} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.ip ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(s.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {s.last_used_at ? formatDateTime(s.last_used_at) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(s.expires_at)}
                      </TableCell>
                      {canRevoke && (
                        <TableCell className="text-right">
                          {revokeButton(s)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile" data-testid="admin-sessions-cards">
              {items.map((s) => (
                <div
                  className="flex flex-col gap-2.5 border-b p-3.5 last:border-b-0"
                  key={s.id}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {identity(s)}
                    {canRevoke && (
                      <span className="shrink-0">{revokeButton(s)}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-muted-foreground">
                    <UserAgentBadge ua={s.user_agent} />
                    <span className="font-mono">{s.ip ?? "—"}</span>
                    <span>
                      {t("admin.sessions.col.expires")}:{" "}
                      {formatDateTime(s.expires_at)}
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
          total={sessions.data?.total ?? 0}
          loading={sessions.isFetching}
        />
      </div>

      <CleanupDialog
        open={cleaning}
        onOpenChange={setCleaning}
        subject={t("admin.sessions.list_title")}
        warning={t("admin.sessions.cleanup_warning")}
        pending={purge.isPending}
        onPurge={async (olderThan) => {
          const { deleted } = await purge.mutateAsync(olderThan);
          toast.success(t("admin.sessions.cleanup_done", { count: deleted }));
        }}
      />

      {target && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setTarget(null)}
          title={t("admin.sessions.revoke_title")}
          description={revokeDescription}
          confirmLabel={t("admin.sessions.revoke")}
          confirmIcon={LogOut}
          destructive
          loading={revoke.isPending}
          error={confirmError}
          onConfirm={runRevoke}
        />
      )}
    </div>
  );
}
