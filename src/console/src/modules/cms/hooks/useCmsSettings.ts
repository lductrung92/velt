import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cmsSettingsService } from "../services/cmsSettings.service";
import { cmsKeys } from "./cmsKeys";

export function useCmsSettings(enabled = true) {
  return useQuery({
    queryKey: cmsKeys.settings(),
    queryFn: () => cmsSettingsService.get(),
    enabled,
  });
}

export function useUpdateCmsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, boolean | string | number>) =>
      cmsSettingsService.update(updates),
    // Server returns the fresh "cms" group — seed the cache so the form resyncs
    // (clears dirty state).
    onSuccess: (data) => qc.setQueryData(cmsKeys.settings(), data),
  });
}
