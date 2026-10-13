import {
  ArrowRight,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RowAction, RowActions } from "@/components/common/RowActions";
import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { PageHeader } from "@/components/common/PageHeader";
import { RoleBadge } from "@/components/common/RoleBadge";
import { SortableHead } from "@/components/common/SortableHead";
import { StatusBadge } from "@/components/common/StatusBadge";
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
import { useAuthStore } from "@/store/auth.store";
import { parseApiError } from "@/utils/apiError";
import { formatDate, formatDateTime } from "@/utils/format";

import { UserFormDialog } from "../components/UserFormDialog";
import {
  useDeleteUser,
  useResetUserPassword,
  useUsers,
} from "../hooks/useAdminUsers";
import type { AdminUser, UserStatus } from "../services/admin.service";

import "@/styles/list-page.css";
import "./users.css";

const STATUS_TONE: Record<UserStatus, "success" | "neutral" | "warning"> = {
  active: "success",
  disabled: "neutral",
  locked: "warning",
};

const STATUSES: UserStatus[] = ["active", "disabled", "locked"];

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: AdminUser }
  | null;
type ConfirmState = { kind: "delete" | "reset"; user: AdminUser } | null;

export default function UserManagement() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Search applies on submit (`draftQ` → `q`); status applies straight away
  // from the tabs row. Either narrowing goes back to page 1.
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);

  // Sort: 3-state cycle per column (idle → asc → desc → idle). Default is
  // created_at desc; `null` (idle) falls back to that. Roles/actions never sort.
  const [sort, setSort] = useState<string | null>("-created_at");

  const params = {
    q,
    status,
    page,
    page_size: DEFAULT_PAGE_SIZE,
    sort: sort ?? "-created_at",
  };
  const users = useUsers(params);

  // A narrower result set makes the old page number meaningless.
  function narrow(apply: () => void) {
    apply();
    setPage(1);
  }

  const handleSort = (next: string | null) => {
    setSort(next);
    setPage(1);
  };

  const chips: FilterChip[] = [];
  if (q)
    chips.push({
      key: "q",
      label: t("admin.users.search_label"),
      value: q,
      onRemove: () =>
        narrow(() => {
          setQ("");
          setDraftQ("");
        }),
    });
  if (status)
    chips.push({
      key: "status",
      label: t("admin.users.col.status"),
      value: t(`admin.users.status.${status}`),
      onRemove: () => narrow(() => setStatus("")),
    });

  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const del = useDeleteUser();
  const reset = useResetUserPassword();

  const canCreate = hasPermission("users.create");
  const canUpdate = hasPermission("users.update");
  const canDelete = hasPermission("users.delete");

  function openConfirm(next: ConfirmState) {
    setConfirmError(null);
    setConfirm(next);
  }

  function runConfirm() {
    if (!confirm) return;
    setConfirmError(null);
    const onError = (err: unknown) =>
      setConfirmError(parseApiError(err, t).message);
    if (confirm.kind === "delete") {
      del.mutate(confirm.user.id, {
        onSuccess: () => {
          toast.success(t("admin.users.deleted"));
          setConfirm(null);
        },
        onError,
      });
    } else {
      reset.mutate(confirm.user.id, {
        onSuccess: () => {
          toast.success(t("admin.users.reset_sent"));
          setConfirm(null);
        },
        onError,
      });
    }
  }

  const items = users.data?.items ?? [];
  const hasFilter = q !== "" || status !== "";

  // Sortable column header — 3-state cycle, ArrowUpDown/ArrowUp/ArrowDown icon +
  // aria-sort (table.md §2). Roles + actions render a plain <TableHead>.
  const SortHead = ({ col, label }: { col: string; label: string }) => (
    <SortableHead col={col} label={label} sort={sort} onSort={handleSort} />
  );

  const identity = (u: AdminUser) => (
    <div className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
        {u.avatar_url ? (
          <img src={u.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          <UserIcon className="size-4 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium">{u.full_name}</div>
        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
      </div>
    </div>
  );

  const rowActions = (u: AdminUser) => (
    <UserRowActions
      user={u}
      isSelf={u.id === currentUserId}
      canUpdate={canUpdate}
      canDelete={canDelete}
      onEdit={() => setDialog({ kind: "edit", user: u })}
      onReset={() => openConfirm({ kind: "reset", user: u })}
      onDelete={() => openConfirm({ kind: "delete", user: u })}
    />
  );

  return (
    <div className="list-page" data-list="admin-users">
      <PageHeader
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        breadcrumbs={[{ labelKey: "nav.users" }]}
      />

      <section className="list-panel" aria-label={t("admin.users.title")}>
        <div className="list-panel-heading">
          <div>
            <h2>{t("admin.users.list_title")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={users.isFetching}
              onClick={() => void users.refetch()}
            >
              <RotateCcw
                className={
                  users.isFetching
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden
              />
              {t("common.refresh")}
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
                <Plus className="size-4" />
                {t("common.add_new")}
              </Button>
            )}
          </div>
        </div>

        <div className="list-toolbar">
          <form
            className="list-search"
            onSubmit={(event) => {
              event.preventDefault();
              narrow(() => setQ(draftQ.trim()));
            }}
          >
            <Search className="size-4" aria-hidden />
            <Input
              type="search"
              value={draftQ}
              aria-label={t("admin.users.search_label")}
              placeholder={t("admin.users.search_ph")}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQ(value);
                // Clearing the box clears the applied search too; making
                // someone press Enter on an empty field to see everything again
                // is a trap.
                if (!value && q) narrow(() => setQ(""));
              }}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("admin.users.search_label")}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>

        <div
          className="list-tabs"
          role="group"
          aria-label={t("admin.users.status_filter_label")}
        >
          <button
            type="button"
            aria-pressed={!status}
            onClick={() => narrow(() => setStatus(""))}
          >
            {t("admin.users.status_all")}
          </button>
          {STATUSES.map((value) => (
            <button
              type="button"
              key={value}
              data-status={value}
              aria-pressed={status === value}
              onClick={() =>
                narrow(() => setStatus(status === value ? "" : value))
              }
            >
              <i aria-hidden />
              {t(`admin.users.status.${value}`)}
            </button>
          ))}
        </div>

        <FilterChips
          className="list-filter-chips"
          items={chips}
          onClearAll={
            hasFilter
              ? () =>
                  narrow(() => {
                    setQ("");
                    setDraftQ("");
                    setStatus("");
                  })
              : undefined
          }
        />

        {users.isError ? (
          <div className="list-error">
            <Alert
              variant="danger"
              message={parseApiError(users.error, t).message}
            />
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void users.refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : users.isLoading && !users.data ? (
          <div className="list-loading" aria-label={t("common.loading")}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !items.length ? (
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
                <Plus className="list-empty-plus" />
              </div>
            </div>
            <h3>
              {t(
                hasFilter
                  ? "admin.users.no_results"
                  : "admin.users.empty_title",
              )}
            </h3>
            <p>
              {t(
                q || status
                  ? "admin.users.no_results_hint"
                  : "admin.users.empty_hint",
              )}
            </p>
            {!hasFilter && canCreate && (
              <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
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
                data-testid="admin-users-table"
                wrapperClassName="list-table-wrap"
              >
                <TableHeader>
                  <TableRow>
                    <SortHead
                      col="full_name"
                      label={t("admin.users.col.user")}
                    />
                    <SortHead
                      col="status"
                      label={t("admin.users.col.status")}
                    />
                    <TableHead>{t("admin.users.col.roles")}</TableHead>
                    <SortHead
                      col="last_login_at"
                      label={t("admin.users.col.last_login")}
                    />
                    <SortHead
                      col="created_at"
                      label={t("admin.users.col.created")}
                    />
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">
                        {t("admin.users.col.actions")}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{identity(u)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONE[u.status]}>
                          {t(`admin.users.status.${u.status}`)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <RolesCell roles={u.roles} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {u.last_login_at
                          ? formatDateTime(u.last_login_at)
                          : t("admin.users.never_logged_in")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {rowActions(u)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="list-mobile" data-testid="admin-users-cards">
              {items.map((u) => (
                <div
                  className="flex flex-col gap-2.5 border-b p-3.5 last:border-b-0"
                  key={u.id}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {identity(u)}
                    <span className="shrink-0">{rowActions(u)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                    <StatusBadge tone={STATUS_TONE[u.status]}>
                      {t(`admin.users.status.${u.status}`)}
                    </StatusBadge>
                    <RolesCell roles={u.roles} />
                    {/* Labelled, unlike the table: a bare timestamp on a card
                        has no column header to explain it. */}
                    <span className="text-xs text-muted-foreground">
                      {t("admin.users.col.last_login")}:{" "}
                      {u.last_login_at
                        ? formatDateTime(u.last_login_at)
                        : t("admin.users.never_logged_in")}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="list-pagination">
              <TablePagination
                page={page}
                pageSize={DEFAULT_PAGE_SIZE}
                total={users.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </section>

      {dialog && (
        <UserFormDialog
          mode={dialog.kind}
          user={dialog.kind === "edit" ? dialog.user : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={
            confirm.kind === "delete"
              ? t("admin.users.delete_title")
              : t("admin.users.reset_title")
          }
          description={
            confirm.kind === "delete"
              ? t("admin.users.delete_desc", { name: confirm.user.full_name })
              : t("admin.users.reset_desc", { name: confirm.user.full_name })
          }
          confirmLabel={
            confirm.kind === "delete"
              ? t("common.delete")
              : t("admin.users.action_reset")
          }
          confirmIcon={confirm.kind === "delete" ? Trash2 : Send}
          destructive={confirm.kind === "delete"}
          loading={confirm.kind === "delete" ? del.isPending : reset.isPending}
          error={confirmError}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}

function RolesCell({ roles }: { roles: AdminUser["roles"] }) {
  const { t } = useTranslation();
  // Defensive: a user with no roles may arrive as null/undefined; never crash.
  const list = roles ?? [];
  if (list.length === 0)
    return <span className="text-muted-foreground">—</span>;
  const shown = list.slice(0, 2);
  const extra = list.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((r) => (
        <RoleBadge key={r.id} code={r.code} name={r.name} />
      ))}
      {extra > 0 && (
        <span className="text-xs text-muted-foreground">
          {t("admin.users.roles_more", { n: extra })}
        </span>
      )}
    </div>
  );
}

function UserRowActions({
  user,
  isSelf,
  canUpdate,
  canDelete,
  onEdit,
  onReset,
  onDelete,
}: {
  user: AdminUser;
  isSelf: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  // Nothing actionable → no menu.
  if (!canUpdate && !canDelete) return null;
  return (
    <RowActions>
      {canUpdate && (
        <RowAction
          icon={Pencil}
          label={t("admin.users.action_edit")}
          onClick={onEdit}
        />
      )}
      {canUpdate && (
        <RowAction
          icon={KeyRound}
          label={t("admin.users.action_reset")}
          // Reset is meaningless on a non-active account (BE → 409).
          disabled={user.status !== "active"}
          onClick={onReset}
        />
      )}
      {canDelete && !isSelf && (
        <RowAction
          destructive
          icon={Trash2}
          label={t("admin.users.action_delete")}
          onClick={onDelete}
        />
      )}
    </RowActions>
  );
}
