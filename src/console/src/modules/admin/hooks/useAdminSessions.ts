import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  adminService,
  type ListSessionsParams,
} from "../services/admin.service";
import { adminKeys } from "./adminKeys";

export function useSessions(params: ListSessionsParams) {
  return useQuery({
    queryKey: adminKeys.sessions.list(params),
    queryFn: () => adminService.listSessions(params),
    placeholderData: keepPreviousData,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminService.revokeSession(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.sessions.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.home.all() }); // refresh dashboard count
    },
  });
}

export function useRevokeUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminService.revokeUserSessions(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.sessions.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.home.all() }); // refresh dashboard count
    },
  });
}
