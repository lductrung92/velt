import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { SelectOption } from "@/components/common/Select/Select";

import {
  categoriesService,
  type Category,
} from "../services/categories.service";
import { pagesService, type PageNode } from "../services/pages.service";
import { articlesService } from "../services/articles.service";
import { cmsKeys } from "./cmsKeys";

interface TargetOptionsResult {
  options: SelectOption[];
  isLoading: boolean;
}

// Indent nested tree labels so the hierarchy reads in a flat <Select>.
const PREFIX = "— ";

function flattenCategories(tree: Category[], depth = 0): SelectOption[] {
  return tree.flatMap((c) => [
    { value: c.id, label: PREFIX.repeat(depth) + c.name },
    ...flattenCategories(c.children, depth + 1),
  ]);
}

function flattenPages(tree: PageNode[], depth = 0): SelectOption[] {
  return tree.flatMap((p) => [
    { value: p.id, label: PREFIX.repeat(depth) + p.title },
    ...flattenPages(p.children, depth + 1),
  ]);
}

// Article picker — server-side search (paginated). `enabled` keeps the query
// idle until the article link type is actually selected.
export function useArticleTargets(q: string, enabled: boolean) {
  const query = useQuery({
    queryKey: cmsKeys.menuTargets("article", q),
    queryFn: () => articlesService.list({ q, page_size: 20 }),
    enabled,
    placeholderData: keepPreviousData,
  });
  return {
    options: (query.data?.items ?? []).map((a) => ({
      value: a.id,
      label: a.title,
    })),
    isLoading: query.isFetching,
  } satisfies TargetOptionsResult;
}

// Page picker — full tree, filtered client-side by the <Select>.
export function usePageTargets(enabled: boolean) {
  const query = useQuery({
    queryKey: cmsKeys.menuTargets("page", ""),
    queryFn: () => pagesService.list(),
    enabled,
  });
  return {
    options: flattenPages(query.data ?? []),
    isLoading: query.isFetching,
  } satisfies TargetOptionsResult;
}

// Category picker — full tree, filtered client-side by the <Select>.
export function useCategoryTargets(enabled: boolean) {
  const query = useQuery({
    queryKey: cmsKeys.menuTargets("category", ""),
    queryFn: () => categoriesService.list(),
    enabled,
  });
  return {
    options: flattenCategories(query.data ?? []),
    isLoading: query.isFetching,
  } satisfies TargetOptionsResult;
}
