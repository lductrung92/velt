import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  pagesService,
  type CreatePageBody,
  type UpdatePageBody,
} from "../services/pages.service";
import { cmsKeys } from "./cmsKeys";

export function usePages() {
  return useQuery({
    queryKey: cmsKeys.pageList(),
    queryFn: () => pagesService.list(),
  });
}

export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: cmsKeys.pageDetail(id ?? ""),
    queryFn: () => pagesService.get(id as string),
    enabled: !!id,
  });
}

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePageBody) => pagesService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.pages() }),
  });
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePageBody }) =>
      pagesService.update(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cmsKeys.pages() });
      qc.setQueryData(cmsKeys.pageDetail(data.id), data);
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pagesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.pages() }),
  });
}

export function usePublishPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? pagesService.publish(id) : pagesService.unpublish(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cmsKeys.pages() });
      qc.setQueryData(cmsKeys.pageDetail(data.id), data);
    },
  });
}
