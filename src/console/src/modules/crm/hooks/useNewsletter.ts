import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  newsletterService,
  type SubscriberListParams,
} from "../services/newsletter.service";

export const subscriberKeys = {
  all: ["newsletter-subscribers"] as const,
  list: (p: SubscriberListParams) =>
    [...subscriberKeys.all, "list", p] as const,
};

export function useSubscribers(params: SubscriberListParams, enabled: boolean) {
  return useQuery({
    queryKey: subscriberKeys.list(params),
    queryFn: () => newsletterService.list(params),
    // The list is behind a tab; fetching it while the other tab is open would
    // spend a request on a screen nobody is looking at.
    enabled,
  });
}

export function useDeleteSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => newsletterService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriberKeys.all }),
  });
}
