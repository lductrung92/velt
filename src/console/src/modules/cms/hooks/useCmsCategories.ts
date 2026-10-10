import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  categoriesService,
  type Category,
  type CreateCategoryBody,
  type UpdateCategoryBody,
} from "../services/categories.service";
import type { ReorderMove } from "../utils/categoryTree";
import { cmsKeys } from "./cmsKeys";

export function useCategories() {
  return useQuery({
    queryKey: cmsKeys.categories(),
    queryFn: () => categoriesService.list(),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryBody) => categoriesService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.categories() }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryBody }) =>
      categoriesService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.categories() }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.categories() }),
  });
}

// Drag-drop reorder: the backend has no atomic reorder endpoint, so a drop is a
// batch of `PATCH /categories/{id}` (one per node whose parent/sort changed). We
// render `optimisticTree` immediately and roll back to the pre-drag snapshot if
// ANY patch fails (e.g. 422 category_cycle / 409 conflict), then refetch to
// reconcile.
export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      moves,
    }: {
      moves: ReorderMove[];
      optimisticTree: Category[];
    }) =>
      Promise.all(
        moves.map((m) => {
          const body: UpdateCategoryBody = {
            sort_order: m.sort_order,
            updated_at: m.updated_at,
          };
          if (m.parent_id !== undefined) body.parent_id = m.parent_id;
          return categoriesService.update(m.id, body);
        }),
      ),
    onMutate: async ({ optimisticTree }) => {
      await qc.cancelQueries({ queryKey: cmsKeys.categories() });
      const snapshot = qc.getQueryData<Category[]>(cmsKeys.categories());
      qc.setQueryData(cmsKeys.categories(), optimisticTree);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(cmsKeys.categories(), ctx.snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: cmsKeys.categories() }),
  });
}
