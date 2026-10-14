import { useMutation, useQuery } from "@tanstack/react-query";

import {
  regionsService,
  type Group,
  type Slot,
  type RegionBlockInput,
} from "../services/regions.service";
import { cmsKeys } from "./cmsKeys";

export function useRegions() {
  return useQuery({
    queryKey: cmsKeys.regionList(),
    queryFn: () => regionsService.list(),
  });
}

// Whole-list replace for one (group, slot) pair, the same shape as the menu
// item tree. One save may touch several slots, so the cache is written by the
// caller once every PUT has landed rather than per mutation.
export function useReplaceRegionBlocks() {
  return useMutation({
    mutationFn: ({
      group,
      slot,
      blocks,
    }: {
      group: Group;
      slot: Slot;
      blocks: RegionBlockInput[];
    }) => regionsService.replaceBlocks(group, slot, blocks),
  });
}
