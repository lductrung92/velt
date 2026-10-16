import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  pagesService,
  type CreatePageBody,
  type PageListParams,
  type UpdatePageBody,
} from "../services/pages.service";
import { cmsKeys } from "./cmsKeys";

export function usePages(params: PageListParams = {}) {
  return useQuery({
    queryKey: cmsKeys.pageList(params),
    queryFn: () => pagesService.list(params),
  });
}

/**
 * The counts behind the overview cards, one cheap query each: the list is
 * paginated now, so a count can no longer be taken from the rows on screen.
 * `landing` is not a status, so it rides its own query.
 */
export function usePageOverview(enabled: boolean) {
  const queries: PageListParams[] = [
    {},
    { status: "draft" },
    { status: "published" },
    { landing: "1" },
  ];
  return useQueries({
    queries: queries.map((params) => {
      const withSize = { ...params, page: 1, page_size: 1 };
      return {
        queryKey: cmsKeys.pageList(withSize),
        queryFn: () => pagesService.list(withSize),
        enabled,
      };
    }),
  });
}

/** Every page, for a selector. Never paginated — see PageOption. */
export function usePageOptions() {
  return useQuery({
    queryKey: cmsKeys.pageOptions(),
    queryFn: () => pagesService.options(),
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
