import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  productsService,
  type CreateProductBody,
  type MediaDevice,
  type ProductListParams,
  type UpdateProductBody,
} from "../services/products.service";
import { productKeys } from "./productKeys";

// keepPreviousData avoids an empty flash on page/filter change.
export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productsService.list(params),
    placeholderData: keepPreviousData,
  });
}

// Counts for the overview cards. Each one is a page_size=1 request read for its
// `total`, so the figures come from the server rather than from whatever rows
// the current page and filters happen to hold.
export function useProductOverview(
  filters: readonly ProductListParams[],
  enabled: boolean,
) {
  return useQueries({
    queries: filters.map((filter) => {
      const params: ProductListParams = { ...filter, page: 1, page_size: 1 };
      return {
        queryKey: productKeys.list(params),
        queryFn: () => productsService.list(params),
        enabled,
      };
    }),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ""),
    queryFn: () => productsService.get(id as string),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductBody) => productsService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductBody }) =>
      productsService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

// One hook for all three publication transitions: they share a permission, a
// cache effect and an error surface, so three near-identical hooks would only
// spread the same logic thinner.
export function useProductTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "publish" | "unpublish" | "archive";
    }) => productsService[action](id),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useUploadProductMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      file,
      purpose,
    }: {
      id: string;
      file: File | Blob;
      purpose?: "cover" | "og" | "inline";
    }) => productsService.upload(id, file, purpose),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

// --- Relations ---
//
// Each of these replaces a whole set, so one hook per relation is enough; the
// cache effect is identical (the product detail carries them all).

export function useSetProductCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, categoryIds }: { id: string; categoryIds: string[] }) =>
      productsService.setCategories(id, categoryIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useSetProductMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      members,
    }: {
      id: string;
      members: { member_id: string; role?: string }[];
    }) => productsService.setMembers(id, members),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useAddGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      file,
      caption,
      device,
    }: {
      id: string;
      file: File | Blob;
      caption?: string;
      device?: MediaDevice | null;
    }) => productsService.addGalleryImage(id, file, caption, device),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useAddGalleryVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      videoUrl,
      caption,
      device,
    }: {
      id: string;
      videoUrl: string;
      caption?: string;
      device?: MediaDevice | null;
    }) => productsService.addGalleryVideo(id, videoUrl, caption, device),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useUpdateGalleryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      mediaId,
      caption,
      device,
      is_hero,
    }: {
      id: string;
      mediaId: string;
      caption: string | null;
      device: MediaDevice | null;
      is_hero?: boolean;
    }) =>
      productsService.updateGalleryItem(id, mediaId, {
        caption,
        device,
        is_hero,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useRemoveGalleryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mediaId }: { id: string; mediaId: string }) =>
      productsService.removeGalleryItem(id, mediaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useReorderGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ids }: { id: string; ids: string[] }) =>
      productsService.reorderGallery(id, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
