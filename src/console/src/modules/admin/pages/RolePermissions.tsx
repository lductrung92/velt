// M03_RBAC — read-only Roles & Permissions screen (merged from the former
// separate Roles + Permissions pages). Pick a role; its permission set renders
// as a grid of resource cards listing the actions it holds. Baseline roles are
// seeded via migration — there is no edit affordance.
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseApiError } from "@/utils/apiError";

import {
  usePermissionsCatalog,
  useRole,
  useRoles,
} from "../hooks/useAdminRoles";

interface RoleOption {
  value: string;
  label: string;
}

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

  // super_admin holds `*` (all permissions) — its breakdown is just the whole
  // catalog, nothing useful to inspect — so keep it out of the picker.
  const selectableRoles = useMemo(
    () => (roles.data ?? []).filter((r) => r.code !== "super_admin"),
    [roles.data],
  );

  // Land on the first role once the list loads / the current selection vanishes.
  useEffect(() => {
    if (
      selectableRoles.length > 0 &&
      !selectableRoles.some((r) => r.id === selectedId)
    ) {
      setSelectedId(selectableRoles[0].id);
    }
  }, [selectableRoles, selectedId]);

  const roleOptions: RoleOption[] = useMemo(
    () => selectableRoles.map((r) => ({ value: r.id, label: r.name })),
    [selectableRoles],
  );

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
    roles.isLoading || (Boolean(selectedId) && detail.isLoading);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.rbac.title")}
        subtitle={t("admin.rbac.subtitle")}
        breadcrumbs={[{ labelKey: "nav.rbac" }]}
      />

      <div className="max-w-xs space-y-1.5">
        <span className="text-sm font-medium">
          {t("admin.rbac.select_role")}
        </span>
        <Select<RoleOption>
          options={roleOptions}
          value={roleOptions.find((o) => o.value === selectedId) ?? null}
          onChange={(opt) => opt && setSelectedId(opt.value)}
          inputId="rbac-role"
          isSearchable={false}
          isClearable={false}
          aria-label={t("admin.rbac.select_role")}
        />
        {selectedRole?.description && (
          <p className="text-sm text-muted-foreground">
            {selectedRole.description}
          </p>
        )}
      </div>

      {roles.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(roles.error, t).message}
        />
      ) : detail.isError ? (
        <Alert
          variant="danger"
          message={parseApiError(detail.error, t).message}
        />
      ) : detailLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState title={t("admin.rbac.no_perms")} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {grouped.map(([resource, perms]) => (
            <PermissionGroupCard
              key={resource}
              resource={resource}
              perms={perms}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Long permission lists (e.g. cms.* has ~20 actions) make a card tower over the
// grid. Collapse to COLLAPSED_COUNT with a footer "show more / show less"
// toggle pinned to the card bottom; a top-shadow + fade gradient signals the
// list is truncated.
const COLLAPSED_COUNT = 5;

function PermissionGroupCard({
  resource,
  perms,
}: {
  resource: string;
  perms: PermLeaf[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const collapsible = perms.length > COLLAPSED_COUNT;
  const shown =
    expanded || !collapsible ? perms : perms.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b bg-secondary/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold capitalize">{resource}</h3>
      </div>
      <div className="relative flex-1">
        <ul className="divide-y">
          {shown.map((p) => (
            <li key={p.code} className="px-4 py-2.5">
              <div className="font-mono text-sm font-medium">{p.action}</div>
              {p.description && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {p.description}
                </div>
              )}
            </li>
          ))}
        </ul>
        {collapsible && !expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
          />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center justify-center gap-1 border-t px-4 py-2 text-sm font-medium text-primary shadow-[0_-6px_10px_-8px_rgba(0,0,0,0.25)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
    </Card>
  );
}
