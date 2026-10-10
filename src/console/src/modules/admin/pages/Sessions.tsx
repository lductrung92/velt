import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserAgentBadge } from "@/components/common/UserAgentBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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

import { useRevokeSession, useSessions } from "../hooks/useAdminSessions";
import type { AdminSession } from "../services/admin.service";

export default function Sessions() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canRevoke = hasPermission("sessions.revoke");

  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [activeOnly]);

  const sessions = useSessions({
    active: activeOnly,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  });
  const revoke = useRevokeSession();
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

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("admin.sessions.title")}
        subtitle={t("admin.sessions.subtitle")}
        breadcrumbs={[{ labelKey: "nav.sessions" }]}
      />

      <ListToolbar
        onRefresh={() => void sessions.refetch()}
        refreshDisabled={sessions.isFetching}
      >
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
          {t("admin.sessions.active_only")}
        </label>
      </ListToolbar>

      {sessions.isLoading && !sessions.data ? (
        <Skeleton className="h-40 w-full" />
      ) : sessions.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(sessions.error, t).message}
        />
      ) : (
        <>
          <Table scroll={false} data-testid="admin-sessions-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.sessions.col.user")}</TableHead>
                <TableHead>{t("admin.sessions.col.device")}</TableHead>
                <TableHead>{t("admin.sessions.col.ip")}</TableHead>
                <TableHead>{t("admin.sessions.col.created")}</TableHead>
                <TableHead>{t("admin.sessions.col.last_used")}</TableHead>
                <TableHead>{t("admin.sessions.col.expires")}</TableHead>
                <TableHead>{t("admin.sessions.col.status")}</TableHead>
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
              {items.length === 0 && (
                <TableEmpty colSpan={canRevoke ? 8 : 7} />
              )}
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserAgentBadge ua={s.user_agent} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.ip ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(s.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.last_used_at ? formatDateTime(s.last_used_at) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(s.expires_at)}
                  </TableCell>
                  <TableCell>
                    {s.current && (
                      <StatusBadge tone="success">
                        {t("admin.sessions.current")}
                      </StatusBadge>
                    )}
                  </TableCell>
                  {canRevoke && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("admin.sessions.revoke")}
                        title={t("admin.sessions.revoke")}
                        onClick={() => {
                          setConfirmError(null);
                          setTarget(s);
                        }}
                      >
                        <LogOut className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={sessions.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

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
