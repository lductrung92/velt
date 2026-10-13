import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  productCategoriesService,
  type CreateProductCategoryBody,
  type UpdateProductCategoryBody,
} from "../services/productCategories.service";
import { productKeys } from "./productKeys";

export function useProductCategories() {
  return useQuery({
    queryKey: productKeys.categories(),
    queryFn: () => productCategoriesService.list(),
  });
}

export function useCreateProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductCategoryBody) =>
      productCategoriesService.create(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productKeys.categories() }),
  });
}

export function useUpdateProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateProductCategoryBody;
    }) => productCategoriesService.update(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productKeys.categories() }),
  });
}

export function useDeleteProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productCategoriesService.remove(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productKeys.categories() }),
  });
}

export function useReorderProductCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => productCategoriesService.reorder(ids),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productKeys.categories() }),
  });
}
