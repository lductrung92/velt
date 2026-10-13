import type { ActivityListParams } from "../services/activity.service";
import type {
  ListSessionsParams,
  ListUsersParams,
} from "../services/admin.service";

// Per-module React Query key factory (console-react.md "Query keys") — never
// hardcode ["admin","users",...] inline at call sites.
export const adminKeys = {
  all: ["admin"] as const,
  users: {
    all: () => [...adminKeys.all, "users"] as const,
    list: (params: ListUsersParams) =>
      [...adminKeys.users.all(), "list", params] as const,
    detail: (id: string) => [...adminKeys.users.all(), "detail", id] as const,
  },
  roles: {
    all: () => [...adminKeys.all, "roles"] as const,
    list: () => [...adminKeys.roles.all(), "list"] as const,
    detail: (id: string) => [...adminKeys.roles.all(), "detail", id] as const,
  },
  permissions: () => [...adminKeys.all, "permissions"] as const,
  sessions: {
    all: () => [...adminKeys.all, "sessions"] as const,
    list: (params: ListSessionsParams) =>
      [...adminKeys.sessions.all(), "list", params] as const,
  },
  activity: {
    all: () => [...adminKeys.all, "activity"] as const,
    list: (params: ActivityListParams) =>
      [...adminKeys.activity.all(), "list", params] as const,
    actions: () => [...adminKeys.activity.all(), "actions"] as const,
  },
  home: {
    all: () => [...adminKeys.all, "home"] as const,
    usersCount: () => [...adminKeys.all, "home", "users-count"] as const,
    sessionsCount: () => [...adminKeys.all, "home", "sessions-count"] as const,
    rolesCount: () => [...adminKeys.all, "home", "roles-count"] as const,
  },
};
