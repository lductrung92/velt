import { useQuery } from "@tanstack/react-query";

import { cmsKeys } from "@/modules/cms/hooks/cmsKeys";
import { articlesService } from "@/modules/cms/services/articles.service";
import {
  pagesService,
  type PageNode,
} from "@/modules/cms/services/pages.service";
import { memberKeys } from "@/modules/members/hooks/memberKeys";
import { membersService } from "@/modules/members/services/members.service";
import { productKeys } from "@/modules/products/hooks/productKeys";
import { productsService } from "@/modules/products/services/products.service";

const recentParams = { page: 1, page_size: 5, sort: "-updated_at" };
const memberParams = { page: 1, page_size: 1 };

/**
 * The window the headline counts and the recent lists both answer for.
 *
 * Empty strings mean "all time" — the same contract the date field uses — and
 * are dropped rather than sent, so an unfiltered dashboard asks the same
 * question it always did and keeps the cache entries it already has.
 */
export interface DateRange {
  from: string;
  to: string;
}

function ranged<T extends object>(params: T, range: DateRange) {
  return {
    ...params,
    ...(range.from ? { created_from: range.from } : {}),
    ...(range.to ? { created_to: range.to } : {}),
  };
}

export function countPages(nodes: PageNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countPages(node.children),
    0,
  );
}

export function useDashboardData(
  access: {
    products: boolean;
    articles: boolean;
    pages: boolean;
    members: boolean;
  },
  range: DateRange = { from: "", to: "" },
) {
  const recent = ranged(recentParams, range);
  const member = ranged(memberParams, range);
  const pageParams = ranged({}, range);

  const products = useQuery({
    queryKey: productKeys.list(recent),
    queryFn: () => productsService.list(recent),
    enabled: access.products,
  });
  const articles = useQuery({
    queryKey: cmsKeys.articleList(recent),
    queryFn: () => articlesService.list(recent),
    enabled: access.articles,
  });
  const pages = useQuery({
    queryKey: [...cmsKeys.pageList(), pageParams],
    queryFn: () => pagesService.list(pageParams),
    enabled: access.pages,
  });
  const members = useQuery({
    queryKey: memberKeys.list(member),
    queryFn: () => membersService.list(member),
    enabled: access.members,
  });
  const allowed = [products, articles, pages, members].filter(
    (_, index) =>
      [access.products, access.articles, access.pages, access.members][index],
  );
  return {
    products,
    articles,
    pages,
    members,
    refreshing: allowed.some((query) => query.isFetching),
    refresh: () => Promise.all(allowed.map((query) => query.refetch())),
  };
}
