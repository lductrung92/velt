import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  tagsService,
  type CreateTagBody,
  type MergeTagsBody,
  type TagListParams,
  type UpdateTagBody,
} from "../services/tags.service";
import { cmsKeys } from "./cmsKeys";

// Paginated list; keepPreviousData avoids an empty flash on page/search change.
export function useTags(params: TagListParams) {
  return useQuery({
    queryKey: cmsKeys.tagList(params),
    queryFn: () => tagsService.list(params),
    placeholderData: keepPreviousData,
  });
}

// Full flat tag set for selectors (merge target picker, article-list filter).
export function useTagOptions() {
  return useQuery({
    queryKey: cmsKeys.tagOptions(),
    queryFn: () => tagsService.options(),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagBody) => tagsService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.tags() }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTagBody }) =>
      tagsService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.tags() }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.tags() }),
  });
}

export function useMergeTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MergeTagsBody) => tagsService.merge(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.tags() }),
  });
}
