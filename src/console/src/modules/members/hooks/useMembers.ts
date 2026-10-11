import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  membersService,
  type CreateMemberBody,
  type MemberListParams,
  type UpdateMemberBody,
} from "../services/members.service";
import { memberKeys } from "./memberKeys";

// Paginated list; keepPreviousData avoids an empty flash on page/search change.
export function useMembers(params: MemberListParams) {
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => membersService.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: memberKeys.detail(id ?? ""),
    queryFn: () => membersService.get(id as string),
    enabled: !!id,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMemberBody) => membersService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMemberBody }) =>
      membersService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => membersService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useReorderMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => membersService.reorder(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useUploadMemberAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File | Blob }) =>
      membersService.uploadAvatar(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useDeleteMemberAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => membersService.deleteAvatar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
