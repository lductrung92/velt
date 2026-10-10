import { useQuery } from "@tanstack/react-query";

import { adminService } from "../services/admin.service";
import { adminKeys } from "./adminKeys";

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: adminKeys.roles.list(),
    queryFn: () => adminService.listRoles(),
    enabled,
  });
}

export function useRole(id: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.roles.detail(id),
    queryFn: () => adminService.getRole(id),
    enabled: enabled && Boolean(id),
  });
}

export function usePermissionsCatalog(enabled = true) {
  return useQuery({
    queryKey: adminKeys.permissions(),
    queryFn: () => adminService.listPermissions(),
    enabled,
    staleTime: 5 * 60_000, // catalog is seed-managed; rarely changes
  });
}
