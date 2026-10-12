import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  articlesService,
  type ArticleListParams,
  type CreateArticleBody,
  type UpdateArticleBody,
  type UploadPurpose,
} from "../services/articles.service";
import { cmsKeys } from "./cmsKeys";

// Paginated list; keepPreviousData avoids an empty flash on page/filter/sort change.
export function useArticles(params: ArticleListParams) {
  return useQuery({
    queryKey: cmsKeys.articleList(params),
    queryFn: () => articlesService.list(params),
    placeholderData: keepPreviousData,
  });
}

// Counts for the overview cards. Each one is a page_size=1 request read for its
// `total`, so the figures come from the server rather than from whatever rows
// the current page and filters happen to hold.
export function useArticleOverview(
  statuses: readonly string[],
  enabled: boolean,
) {
  return useQueries({
    queries: statuses.map((status) => {
      const params: ArticleListParams = {
        status: (status || undefined) as ArticleListParams["status"],
        page: 1,
        page_size: 1,
      };
      return {
        queryKey: cmsKeys.articleList(params),
        queryFn: () => articlesService.list(params),
        enabled,
      };
    }),
  });
}

export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: cmsKeys.articleDetail(id ?? ""),
    queryFn: () => articlesService.get(id as string),
    enabled: !!id,
  });
}

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateArticleBody) => articlesService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.articles() }),
  });
}

export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateArticleBody }) =>
      articlesService.update(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: cmsKeys.articles() });
      qc.setQueryData(cmsKeys.articleDetail(data.id), data);
    },
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => articlesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.articles() }),
  });
}

// Media upload is fired explicitly on save (deferred flow) — no cache touch; the
// caller PATCHes the returned path onto the article.
export function useUploadArticleMedia() {
  return useMutation({
    mutationFn: ({
      id,
      file,
      purpose,
    }: {
      id: string;
      file: File;
      purpose: UploadPurpose;
    }) => articlesService.uploadMedia(id, file, purpose),
  });
}
