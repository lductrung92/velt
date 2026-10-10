// Per-module React Query key factory (console-react.md "Query keys") — never
// hardcode ["account","profile"] inline at call sites.
export const accountKeys = {
  all: ["account"] as const,
  profile: () => [...accountKeys.all, "profile"] as const,
};
