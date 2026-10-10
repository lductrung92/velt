import { useQuery } from "@tanstack/react-query";

import type { IllustrativeData } from "../types";

/**
 * Fetch the illustrative gallery JSON. Cached for one hour because the
 * file is static asset content, not user data. Disabled when no path is
 * supplied.
 */
export function useIllustrative(path: string | undefined) {
  return useQuery({
    queryKey: ["illustrative", path] as const,
    enabled: !!path,
    queryFn: async (): Promise<IllustrativeData> => {
      const res = await fetch(path!);
      if (!res.ok) {
        throw new Error(`illustrative_fetch_failed_${res.status}`);
      }
      return (await res.json()) as IllustrativeData;
    },
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
