// M03_RBAC — read-only Roles & Permissions screen (merged from the former
// separate Roles + Permissions pages). Pick a role; its permission set renders
// as a grid of resource cards listing the actions it holds. Baseline roles are
// seeded via migration — there is no edit affordance.
import {
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  KeyRound,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { parseApiError } from "@/utils/apiError";

import {
  usePermissionsCatalog,
  useRole,
  useRoles,
} from "../hooks/useAdminRoles";

interface PermLeaf {
  code: string;
  action: string;
  description: string | null;
}

export default function RolePermissions() {
  const { t } = useTranslation();
  const roles = useRoles();
  const catalog = usePermissionsCatalog();

  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");

  // super_admin holds `*` (all permissions) — its breakdown is just the whole
  // catalog, nothing useful to inspect — so keep it out of the picker.
  const selectableRoles = useMemo(
    () => (roles.data ?? []).filter((r) => r.code !== "super_admin"),
    [roles.data],
  );

  // Land on the first role once the list loads / the current selection vanishes.
  useEffect(() => {
    if (!selectableRoles.some((r) => r.id === selectedId)) {
      setSelectedId(selectableRoles[0]?.id ?? "");
      setSearch("");
    }
  }, [selectableRoles, selectedId]);

  const selectedRole = selectableRoles.find((r) => r.id === selectedId);
  const detail = useRole(selectedId, Boolean(selectedId));

  // code -> { resource, description } from the seed catalog. The role detail
  // only carries permission codes, so the catalog supplies grouping + wording.
  const codeMeta = useMemo(() => {
    const m = new Map<
      string,
      { resource: string; description: string | null }
    >();
    (catalog.data ?? []).forEach((g) =>
      g.permissions.forEach((p) =>
        m.set(p.code, { resource: g.resource, description: p.description }),
      ),
    );
    return m;
  }, [catalog.data]);

  // Group the role's permission codes by resource, sorted for a stable grid.
  const grouped = useMemo<[string, PermLeaf[]][]>(() => {
    const codes = detail.data?.permissions ?? [];
    const map = new Map<string, PermLeaf[]>();
    for (const code of codes) {
      const meta = codeMeta.get(code);
      const resource = meta?.resource ?? code.split(".")[0] ?? code;
      const action = code.split(".").slice(1).join(".") || code;
      const bucket = map.get(resource) ?? [];
      bucket.push({ code, action, description: meta?.description ?? null });
      map.set(resource, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [detail.data?.permissions, codeMeta]);

  const detailLoading =
    roles.isLoading ||
    catalog.isLoading ||
    (Boolean(selectedId) && detail.isLoading);
  const query = search.trim().toLocaleLowerCase();
  const filtered = grouped
    .map(([resource, perms]): [string, PermLeaf[]] => [
      resource,
      perms.filter((p) =>
        [
          p.code,
          p.description ?? "",
          t(`admin.rbac.resources.${resource}`, { defaultValue: resource }),
          t(`admin.rbac.permission_labels.${p.code}`, {
            defaultValue: p.description ?? p.action,
          }),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
      ),
    ])
    .filter(([, perms]) => perms.length > 0);
  const error = roles.isError
    ? roles.error
    : detail.isError
      ? detail.error
      : catalog.isError
        ? catalog.error
        : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("admin.rbac.title")}
        subtitle={t("admin.rbac.subtitle")}
        breadcrumbs={[{ labelKey: "nav.rbac" }]}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label={t("admin.rbac.select_role")}
          className="min-w-0 rounded-lg border bg-background p-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 px-2 pb-3 pt-1">
            <h2 className="text-base font-medium">
              {t("admin.rbac.roles_label")}
            </h2>
            {!roles.isLoading && !roles.isError && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {selectableRoles.length}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 xl:grid-cols-1">
            {roles.isLoading
              ? Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              : selectableRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    aria-pressed={selectedId === role.id}
                    onClick={() => {
                      setSelectedId(role.id);
                      setSearch("");
                    }}
                    className="group flex min-w-0 items-start gap-2 rounded-md border border-transparent p-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary/15 aria-pressed:bg-primary/5 sm:gap-3 sm:p-3"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-aria-pressed:bg-primary/10 group-aria-pressed:text-primary">
                      <ShieldCheck className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium group-aria-pressed:text-primary">
                        {role.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t("admin.rbac.people_count", {
                          count: role.member_count,
                        })}
                      </span>
                    </span>
                    <ChevronRight
                      className="mt-1 hidden size-4 shrink-0 text-muted-foreground/50 group-aria-pressed:text-primary sm:block"
                      aria-hidden
                    />
                  </button>
                ))}
          </div>
          <div className="mt-4 flex items-start gap-2 border-t px-2 pt-4 text-xs leading-5 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{t("admin.rbac.readonly_hint")}</p>
          </div>
        </aside>

        <section
          aria-label={t("admin.rbac.permissions_label")}
          className="min-w-0 space-y-5"
        >
          {selectedRole && (
            <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
              <div className="flex flex-wrap items-start gap-4 border-b bg-primary/[0.025] p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-primary/10 text-primary">
                  <ShieldCheck className="size-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="break-words text-xl font-medium">
                      {selectedRole.name}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
                      <LockKeyhole className="size-3" aria-hidden />
                      {t(
                        selectedRole.is_system
                          ? "admin.rbac.system_role"
                          : "admin.rbac.custom_role",
                      )}
                    </span>
                  </div>
                  {selectedRole.description && (
                    <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                      {selectedRole.description}
                    </p>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-3 divide-x p-5">
                {[
                  {
                    key: "people",
                    value: selectedRole.member_count,
                    Icon: Users,
                  },
                  {
                    key: "permissions",
                    value: detail.data?.permissions?.length,
                    Icon: KeyRound,
                  },
                  {
                    key: "groups",
                    value:
                      detail.data && !catalog.isLoading && !catalog.isError
                        ? grouped.length
                        : undefined,
                    Icon: Layers3,
                  },
                ].map(({ key, value, Icon }) => (
                  <div
                    key={key}
                    className="flex min-w-0 flex-col px-3 first:pl-0 last:pr-0"
                  >
                    <dt className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-1.5">
                      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">
                        {t(`admin.rbac.summary_${key}`)}
                      </span>
                    </dt>
                    <dd className="mt-auto pt-2 text-2xl font-medium tabular-nums">
                      {value === undefined ? (
                        <Skeleton className="h-8 w-10" />
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {error ? (
            <div className="space-y-3 rounded-lg border bg-background p-5">
              <Alert
                variant="danger"
                message={parseApiError(error, t).message}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void roles.refetch();
                  void catalog.refetch();
                  if (selectedId) void detail.refetch();
                }}
              >
                {t("admin.rbac.retry")}
              </Button>
            </div>
          ) : detailLoading ? (
            <div aria-label={t("admin.rbac.loading")} className="space-y-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : !selectedRole ? (
            <div className="rounded-lg border bg-background p-8">
              <EmptyState title={t("admin.rbac.no_roles")} />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium">
                    {t("admin.rbac.permissions_label")}
                  </h2>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {t("admin.rbac.result_count", {
                      count: filtered.reduce(
                        (sum, [, perms]) => sum + perms.length,
                        0,
                      ),
                      groups: filtered.length,
                    })}
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <TextField
                    aria-label={t("admin.rbac.search")}
                    placeholder={t("admin.rbac.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label={t("admin.rbac.clear_search")}
                      onClick={() => setSearch("")}
                      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-lg border bg-background p-8">
                  <EmptyState
                    title={t(
                      query ? "admin.rbac.no_matches" : "admin.rbac.no_perms",
                    )}
                  />
                  {query && (
                    <div className="mt-4 text-center">
                      <Button variant="outline" onClick={() => setSearch("")}>
                        {t("admin.rbac.clear_search")}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map(([resource, perms]) => (
                    <PermissionGroupCard
                      key={`${selectedId}:${resource}`}
                      resource={resource}
                      perms={perms}
                      searching={Boolean(query)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const RESOURCE_ICONS: Record<string, typeof ShieldCheck> = {
  ai: Bot,
  cms: FileText,
  crm: Users,
  members: Users,
  products: Box,
  users: Users,
  roles: ShieldCheck,
  permissions: KeyRound,
  sessions: LockKeyhole,
};
// Search results are always fully visible, including normally collapsed rows.
const COLLAPSED_COUNT = 5;

function PermissionGroupCard({
  resource,
  perms,
  searching,
}: {
  resource: string;
  perms: PermLeaf[];
  searching: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const collapsible = perms.length > COLLAPSED_COUNT && !searching;
  const shown =
    expanded || !collapsible ? perms : perms.slice(0, COLLAPSED_COUNT);

  const Icon = RESOURCE_ICONS[resource] ?? KeyRound;
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted/20 px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="min-w-0 flex-1 break-words text-sm font-medium">
          {t(`admin.rbac.resources.${resource}`, { defaultValue: resource })}
        </h3>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground">
          {t("admin.rbac.perm_count", { count: perms.length })}
        </span>
      </div>
      <div className="relative flex-1">
        <ul className="divide-y divide-border/60 px-5">
          {shown.map((p) => (
            <li key={p.code} className="flex items-start gap-3 py-3.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <p className="min-w-0 break-words text-sm leading-6">
                  {t(`admin.rbac.permission_labels.${p.code}`, {
                    defaultValue: p.description ?? p.action,
                  })}
                </p>
                <p className="break-all font-mono text-xs leading-6 text-muted-foreground sm:w-56 sm:shrink-0 sm:text-right">
                  {p.code}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-2 border-t bg-muted/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              {t("admin.rbac.show_less")}
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              {t("admin.rbac.show_more", {
                count: perms.length - shown.length,
              })}
            </>
          )}
        </button>
      )}
    </section>
  );
}
