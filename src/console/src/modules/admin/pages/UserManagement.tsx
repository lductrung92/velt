import {
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterChips, type FilterChip } from "@/components/common/FilterChips";
import { FilterPopover } from "@/components/common/FilterPopover";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { RoleBadge } from "@/components/common/RoleBadge";
import { Select } from "@/components/common/Select";
import { SortableHead } from "@/components/common/SortableHead";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const STATUS_TONE: Record<UserStatus, "success" | "neutral" | "warning"> = {
  active: "success",
  disabled: "neutral",
  locked: "warning",
};

// Sentinel for the "Tất cả" status option (maps to the empty applied filter).
const STATUS_ALL = "all";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: AdminUser }
  | null;
type ConfirmState = { kind: "delete" | "reset"; user: AdminUser } | null;

export default function UserManagement() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Filters use a draft → apply model (FilterPopover): `draft` lives in the
  // popover, `applied` drives the query. Page resets to 1 on apply / chip clear.
  const [applied, setApplied] = useState({ q: "", status: "" });
  const [draft, setDraft] = useState({ q: "", status: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Sort: 3-state cycle per column (idle → asc → desc → idle). Default is
  // created_at desc; `null` (idle) falls back to that. Roles/actions never sort.
  const [sort, setSort] = useState<string | null>("-created_at");

  const params = {
    q: applied.q,
    status: applied.status,
    page,
    page_size: DEFAULT_PAGE_SIZE,
    sort: sort ?? "-created_at",
  };
  const users = useUsers(params);

  const handleSort = (next: string | null) => {
    setSort(next);
    setPage(1);
  };

  // "all" is a UI sentinel mapped to "" (no status filter). Keeping it as an
  // explicit option means the trigger always shows a value instead of a bare
  // placeholder, and selecting it clears the filter.
  const STATUS_OPTIONS = [
    { value: STATUS_ALL, label: t("admin.users.status_all") },
    { value: "active", label: t("admin.users.status.active") },
    { value: "disabled", label: t("admin.users.status.disabled") },
    { value: "locked", label: t("admin.users.status.locked") },
  ];

  function clearField(field: "q" | "status") {
    setApplied((a) => ({ ...a, [field]: "" }));
    setPage(1);
  }
  const chips: FilterChip[] = [];
  if (applied.q)
    chips.push({
      key: "q",
      label: t("admin.users.search_label"),
      value: applied.q,
      onRemove: () => clearField("q"),
    });
  if (applied.status)
    chips.push({
      key: "status",
      label: t("admin.users.col.status"),
      value: t(`admin.users.status.${applied.status}`),
      onRemove: () => clearField("status"),
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
  const hasFilter = applied.q !== "" || applied.status !== "";
  const statusOption =
    STATUS_OPTIONS.find((o) => o.value === (draft.status || STATUS_ALL)) ??
    null;

  // Sortable column header — 3-state cycle, ArrowUpDown/ArrowUp/ArrowDown icon +
  // aria-sort (table.md §2). Roles + actions render a plain <TableHead>.
  const SortHead = ({ col, label }: { col: string; label: string }) => (
    <SortableHead col={col} label={label} sort={sort} onSort={handleSort} />
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        breadcrumbs={[{ labelKey: "nav.users" }]}
      />

      <ListToolbar
        onRefresh={() => void users.refetch()}
        refreshDisabled={users.isFetching}
        filter={
          <FilterPopover
            open={filterOpen}
            onOpenChange={(o) => {
              if (o) setDraft(applied); // sync draft to applied when opening
              setFilterOpen(o);
            }}
            onApply={() => {
              setApplied(draft);
              setPage(1);
              setFilterOpen(false);
            }}
            onReset={() => setDraft({ q: "", status: "" })}
            filterActive={hasFilter}
          >
            <div className="space-y-1.5">
              <Label htmlFor="users-filter-q">
                {t("admin.users.search_label")}
              </Label>
              <Input
                id="users-filter-q"
                type="search"
                placeholder={t("admin.users.search_ph")}
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="users-filter-status">
                {t("admin.users.col.status")}
              </Label>
              <Select
                inputId="users-filter-status"
                isSearchable={false}
                options={STATUS_OPTIONS}
                value={statusOption}
                placeholder={t("admin.users.status_all")}
                onChange={(o) =>
                  setDraft((d) => ({
                    ...d,
                    status: o && o.value !== STATUS_ALL ? o.value : "",
                  }))
                }
              />
            </div>
          </FilterPopover>
        }
      >
        {canCreate && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <Plus className="size-4" />
            {t("common.add_new")}
          </Button>
        )}
      </ListToolbar>

      <FilterChips
        items={chips}
        onClearAll={
          hasFilter
            ? () => {
                setApplied({ q: "", status: "" });
                setPage(1);
              }
            : undefined
        }
      />

      {/* 3-state */}
      {users.isLoading && !users.data ? (
        <UsersSkeleton />
      ) : users.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(users.error, t).message}
        />
      ) : (
        <>
          <Table scroll={false} data-testid="admin-users-table">
            <TableHeader>
              <TableRow>
                <SortHead col="full_name" label={t("admin.users.col.user")} />
                <SortHead col="status" label={t("admin.users.col.status")} />
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
              {items.length === 0 && <TableEmpty colSpan={6} />}
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserIcon className="size-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">{u.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[u.status]}>
                      {t(`admin.users.status.${u.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <RolesCell roles={u.roles} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.last_login_at
                      ? formatDateTime(u.last_login_at)
                      : t("admin.users.never_logged_in")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      user={u}
                      isSelf={u.id === currentUserId}
                      canUpdate={canUpdate}
                      canDelete={canDelete}
                      onEdit={() => setDialog({ kind: "edit", user: u })}
                      onReset={() => openConfirm({ kind: "reset", user: u })}
                      onDelete={() => openConfirm({ kind: "delete", user: u })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={users.data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}

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

function RowActions({
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("admin.users.col.actions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate && (
          <DropdownMenuItem onSelect={onEdit}>
            {t("admin.users.action_edit")}
          </DropdownMenuItem>
        )}
        {canUpdate && (
          // Reset is meaningless on a non-active account (BE → 409).
          <DropdownMenuItem
            onSelect={onReset}
            disabled={user.status !== "active"}
          >
            {t("admin.users.action_reset")}
          </DropdownMenuItem>
        )}
        {canDelete && !isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              {t("admin.users.action_delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
