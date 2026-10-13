import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  activityService,
  type ActivityListParams,
} from "../services/activity.service";
import { adminKeys } from "./adminKeys";

export function useActivity(params: ActivityListParams) {
  return useQuery({
    queryKey: adminKeys.activity.list(params),
    queryFn: () => activityService.list(params),
    placeholderData: keepPreviousData,
  });
}

// The log only ever appends, so the set of codes changes when a module ships,
// not while someone is reading the page.
export function useActivityActions() {
  return useQuery({
    queryKey: adminKeys.activity.actions(),
    queryFn: () => activityService.actions(),
    staleTime: 5 * 60 * 1000,
  });
}
