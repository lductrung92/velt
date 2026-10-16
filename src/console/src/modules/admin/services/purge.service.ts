import api from "@/services/api";

// Retention clean-up for the two admin tables that only ever grow: the
// activity log and the session list. Mirrors backend/internal/platform/retention.
//
// A window is a point in the past, and it says what to KEEP: "3d" keeps
// everything from now back to three days ago and permanently deletes what is
// older than that. "all" keeps nothing. The cutoff itself is worked out on the
// server from its own clock, so the console sends the code, never an instant.
export const RETENTION_WINDOWS = [
  "all",
  "3d",
  "7d",
  "1m",
  "3m",
  "6m",
  "1y",
] as const;

export type RetentionWindow = (typeof RETENTION_WINDOWS)[number];

export interface PurgeResult {
  /** How many rows went, so the screen can say so rather than just "done". */
  deleted: number;
}

export const purgeService = {
  async purgeActivity(olderThan: RetentionWindow): Promise<PurgeResult> {
    const { data } = await api.post<PurgeResult>("/activity/purge", {
      older_than: olderThan,
    });
    return data;
  },

  // The acting admin's own sessions are never deleted — see the backend note
  // on Service.PurgeSessions — and the dialog says so.
  async purgeSessions(olderThan: RetentionWindow): Promise<PurgeResult> {
    const { data } = await api.post<PurgeResult>("/admin/sessions/purge", {
      older_than: olderThan,
    });
    return data;
  },
};
