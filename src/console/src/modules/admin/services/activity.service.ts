import api from "@/services/api";

// Mirrors backend/internal/modules/activity. Read-only: the console never
// writes this log, it only asks who did what to what, and when.

export interface ActivityEntry {
  id: number;
  occurred_at: string;
  /** A stable code such as "article.publish", never prose — the screen renders
   *  its own label per language and shows the code when it has none. */
  action: string;
  entity: string | null;
  entity_id: string | null;
  /** The target's name AS IT WAS. Snapshotted at write time, so a record that
   *  has since been deleted is still nameable. */
  entity_label: string | null;
  /** null when the system acted on its own (a scheduled publish, a cron). */
  actor_id: string | null;
  actor_label: string;
  ip: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
}

export interface ActivityListParams {
  q?: string;
  actor_id?: string;
  action?: string;
  entity?: string;
  entity_id?: string;
  /** RFC3339 instants. The date pickers resolve their day in the viewer's own
   *  timezone before sending, so "today" means the viewer's today. */
  from?: string;
  to?: string;
  page: number;
  page_size: number;
}

export interface ActivityListResponse {
  items: ActivityEntry[];
  total: number;
  page: number;
  page_size: number;
  /** Set when a free-text search was clamped to a recent window because the
   *  caller gave no date range — the backend will not scan the whole log. */
  search_from?: string;
}

export const activityService = {
  async list(params: ActivityListParams): Promise<ActivityListResponse> {
    const { data } = await api.get<ActivityListResponse>("/activity", {
      params,
    });
    return data;
  },

  // The codes actually present, so the filter never offers one the log cannot
  // produce and never misses one a new module started writing.
  async actions(): Promise<string[]> {
    const { data } = await api.get<{ items: string[] }>("/activity/actions");
    return data.items;
  },
};
