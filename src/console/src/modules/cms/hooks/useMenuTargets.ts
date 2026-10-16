import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { SelectOption } from "@/components/common/Select/Select";

import {
  categoriesService,
  type Category,
} from "../services/categories.service";
import { pagesService } from "../services/pages.service";
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
    // The option SHOWS a category and sends its id, so it takes the
    // translated name; the stored one belongs to the editor.
    { value: c.id, label: PREFIX.repeat(depth) + c.name_display },
    ...flattenCategories(c.children, depth + 1),
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

// Page picker — every page, filtered client-side by the <Select>. The list
// endpoint is paginated; this one is not, because a picker that stopped at page
// one would hide the page somebody is looking for.
export function usePageTargets(enabled: boolean) {
  const query = useQuery({
    queryKey: cmsKeys.menuTargets("page", ""),
    queryFn: () => pagesService.options(),
    enabled,
  });
  return {
    options: (query.data ?? []).map((p) => ({ value: p.id, label: p.title })),
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
