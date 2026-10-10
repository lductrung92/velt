import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OverviewCard } from "@/components/common/OverviewCard";
import { PageHeader } from "@/components/common/PageHeader";
import { usePermission } from "@/modules/auth";

import { adminKeys } from "../hooks/adminKeys";
import { adminService } from "../services/admin.service";

export default function AdminHome() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();

  const canUsers = hasPermission("users.read");
  const canRoles = hasPermission("roles.read");
  const canSessions = hasPermission("sessions.read");

  const usersCount = useQuery({
    queryKey: adminKeys.home.usersCount(),
    queryFn: async () =>
      (await adminService.listUsers({ page: 1, page_size: 1 })).total,
    enabled: canUsers,
  });
  const sessionsCount = useQuery({
    queryKey: adminKeys.home.sessionsCount(),
    queryFn: async () =>
      (await adminService.listSessions({ active: true, page: 1, page_size: 1 }))
        .total,
    enabled: canSessions,
  });
  const rolesCount = useQuery({
    queryKey: adminKeys.home.rolesCount(),
    queryFn: async () => (await adminService.listRoles()).length,
    enabled: canRoles,
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("admin.home.title")}
        subtitle={t("admin.home.subtitle")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canUsers && (
          <OverviewCard
            icon={Users}
            label={t("admin.home.users")}
            value={usersCount.data}
            loading={usersCount.isLoading}
            error={usersCount.isError}
          />
        )}
        {canSessions && (
          <OverviewCard
            icon={MonitorSmartphone}
            label={t("admin.home.active_sessions")}
            value={sessionsCount.data}
            loading={sessionsCount.isLoading}
            error={sessionsCount.isError}
          />
        )}
        {canRoles && (
          <OverviewCard
            icon={ShieldCheck}
            label={t("admin.home.roles")}
            value={rolesCount.data}
            loading={rolesCount.isLoading}
            error={rolesCount.isError}
          />
        )}
      </div>
    </div>
  );
}
