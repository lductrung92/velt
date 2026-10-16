import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  adminService,
  type CreateUserBody,
  type ListUsersParams,
  type UpdateUserBody,
} from "../services/admin.service";
import { adminKeys } from "./adminKeys";

// Paginated user list. keepPreviousData → no empty flash when paging/filtering.
export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: adminKeys.users.list(params),
    queryFn: () => adminService.listUsers(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => adminService.createUser(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.users.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.home.all() }); // refresh dashboard count
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateUserBody }) =>
      adminService.updateUser(vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users.all() }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.users.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.home.all() }); // refresh dashboard count
    },
  });
}

// Mints a new temporary password. It also revokes the user's sessions
// server-side, so the sessions list is stale the moment this succeeds.
export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminService.resetPassword(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: adminKeys.sessions.all() }),
  });
}
