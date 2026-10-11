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

export function countPages(nodes: PageNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countPages(node.children),
    0,
  );
}

export function useDashboardData(access: {
  products: boolean;
  articles: boolean;
  pages: boolean;
  members: boolean;
}) {
  const products = useQuery({
    queryKey: productKeys.list(recentParams),
    queryFn: () => productsService.list(recentParams),
    enabled: access.products,
  });
  const articles = useQuery({
    queryKey: cmsKeys.articleList(recentParams),
    queryFn: () => articlesService.list(recentParams),
    enabled: access.articles,
  });
  const pages = useQuery({
    queryKey: cmsKeys.pageList(),
    queryFn: () => pagesService.list(),
    enabled: access.pages,
  });
  const members = useQuery({
    queryKey: memberKeys.list(memberParams),
    queryFn: () => membersService.list(memberParams),
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
