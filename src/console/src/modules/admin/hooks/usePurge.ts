import { useMutation, useQueryClient } from "@tanstack/react-query";

import { purgeService, type RetentionWindow } from "../services/purge.service";
import { adminKeys } from "./adminKeys";

export function usePurgeActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (olderThan: RetentionWindow) =>
      purgeService.purgeActivity(olderThan),
    onSuccess: () => {
      // Both the page and the action filter: a purge can take the last row of
      // an action code with it, and the filter must stop offering it.
      void qc.invalidateQueries({ queryKey: adminKeys.activity.all() });
    },
  });
}

export function usePurgeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (olderThan: RetentionWindow) =>
      purgeService.purgeSessions(olderThan),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.sessions.all() });
      void qc.invalidateQueries({ queryKey: adminKeys.home.all() }); // refresh dashboard count
    },
  });
}
