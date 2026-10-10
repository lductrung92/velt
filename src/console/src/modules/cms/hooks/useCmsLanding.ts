import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  landingService,
  type CreateLandingBody,
  type CreateSectionBody,
  type LandingDetail,
  type UpdateLandingBody,
  type UpdateSectionBody,
} from "../services/landing.service";
import { cmsKeys } from "./cmsKeys";

export function useLanding(id: string | undefined) {
  return useQuery({
    queryKey: cmsKeys.landingDetail(id ?? ""),
    queryFn: () => landingService.get(id as string),
    enabled: !!id,
  });
}

export function useCreateLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLandingBody) => landingService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.landings() }),
  });
}

export function useUpdateLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLandingBody }) =>
      landingService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.landings() }),
  });
}

export function useDeleteLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => landingService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.landings() }),
  });
}

export function usePublishLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? landingService.publish(id) : landingService.unpublish(id),
    onSuccess: (data) => cacheDetail(qc, data),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateSectionBody }) =>
      landingService.createSection(id, body),
    onSuccess: (data) => cacheDetail(qc, data),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sectionId,
      body,
    }: {
      sectionId: string;
      body: UpdateSectionBody;
    }) => landingService.updateSection(sectionId, body),
    onSuccess: (data) => cacheDetail(qc, data),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => landingService.deleteSection(sectionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.landings() }),
  });
}

export function useUploadLandingMedia() {
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      landingService.uploadMedia(id, file),
  });
}

export function useReorderSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sectionIds }: { id: string; sectionIds: string[] }) =>
      landingService.reorderSections(id, sectionIds),
    onSuccess: (data) => cacheDetail(qc, data),
  });
}

// cacheDetail writes the fresh detail into the cache and marks lists stale — the
// section endpoints all return the whole landing, so this keeps the builder in sync.
function cacheDetail(
  qc: ReturnType<typeof useQueryClient>,
  data: LandingDetail,
) {
  qc.setQueryData(cmsKeys.landingDetail(data.id), data);
  qc.invalidateQueries({ queryKey: cmsKeys.landingList() });
}
