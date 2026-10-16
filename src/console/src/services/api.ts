import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import axiosRetry from "axios-retry";

import i18n from "@/app/i18n";
import { useAuthStore, type SessionResponse } from "@/store/auth.store";
import { ApiError, type ApiErrorBody } from "@/types/errors";

// Single axios instance for the whole console. baseURL includes the /api
// prefix (set in .env). withCredentials sends the httpOnly refresh cookie on
// cross-origin calls so the backend can rotate it on /auth/refresh + /logout.
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL as string,
  timeout: 10_000, // never hang a request indefinitely (console-react.md)
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Resilience: retry transient failures (network / 5xx / 429) with exponential
// backoff — NEVER 4xx (won't fix by retrying; 401 refresh is handled below).
axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    // Never auto-retry auth POSTs: a flaky login/refresh shouldn't be hammered
    // (and retrying /auth/refresh would multiply refresh-cookie rotations).
    !isAuthFlowEndpoint(err.config?.url) &&
    (axiosRetry.isNetworkError(err) ||
      err.response?.status === 429 ||
      (err.response?.status ?? 0) >= 500),
});

// Endpoints that must never trigger the auto-refresh hop (avoid recursion /
// pointless retry on bad credentials).
function isAuthFlowEndpoint(url: string | undefined): boolean {
  const u = url ?? "";
  return u.includes("/auth/refresh") || u.includes("/auth/login");
}

api.interceptors.request.use((config) => {
  config.headers["X-Correlation-ID"] = crypto.randomUUID();
  // The language the console is being read in. Lists answer with the
  // translation of a title where somebody has written one, so the screen is in
  // one language rather than two. Read off i18n at request time, not at
  // import: the switcher changes it without a reload.
  //
  // A caller that set the header itself keeps it: a form hydrated from a list
  // must ask for the source language, or its next save writes the translation
  // back into the record it was translated from.
  if (!config.headers["Accept-Language"]) {
    config.headers["Accept-Language"] = i18n.language || "vi";
  }
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers["Authorization"]) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Dedupe concurrent refreshes: a burst of 401s shares one /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // No body — the refresh token rides the httpOnly cookie; BE rotates it.
  // Raw axios (not `api`) to avoid recursing through this interceptor; still
  // carry a correlation id for traceability.
  const res = await axios.post<SessionResponse>(
    `${import.meta.env.VITE_API_BASE_URL as string}/auth/refresh`,
    {},
    {
      withCredentials: true,
      timeout: 10_000, // match the instance: a hung /auth/refresh must not stall every queued 401
      headers: { "X-Correlation-ID": crypto.randomUUID() },
    },
  );
  const { setSession } = useAuthStore.getState();
  setSession(res.data.user, res.data.access_token);
  return res.data.access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: ApiErrorBody }>) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error.response?.status;
    const body = error.response?.data?.error;
    const message = body?.message ?? "internal_server_error";

    // 401 handling rule (docs/ai/console-react.md §Auth — codify once):
    // ONLY `401 unauthorized` (genuine session expiry) triggers refresh+retry.
    // A 401 carrying a DOMAIN key (invalid_credentials / invalid_2fa_code /
    // account_locked …) is a re-auth/credential failure → thrown to the caller
    // for inline display; it NEVER triggers refresh/redirect/logout.
    if (
      status === 401 &&
      message === "unauthorized" &&
      original &&
      !original._retry &&
      !isAuthFlowEndpoint(original.url)
    ) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        original.headers["Authorization"] = `Bearer ${newToken}`;
        return api.request(original);
      } catch {
        // Refresh failed → session is really gone. Clear; ProtectedRoute
        // redirects to /login the moment `user` is null.
        useAuthStore.getState().clear();
      }
    }

    const code = body?.code ?? status ?? 500;
    const details = body?.details ?? {};
    return Promise.reject(new ApiError(code, message, details));
  },
);

export default api;
