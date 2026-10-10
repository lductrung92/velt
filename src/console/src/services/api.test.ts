import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";
import { ApiError } from "@/types/errors";

import api from "./api";

const API = "http://localhost/api";
const USER = {
  id: "u1",
  email: "admin@velt.local.vn",
  full_name: "Admin",
  avatar_url: null,
  status: "active" as const,
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
};

beforeEach(() => useAuthStore.getState().clear());

describe("api interceptor — 401 handling", () => {
  it("401 unauthorized → refresh once, retry, succeed", async () => {
    let widgetCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get(`${API}/widgets`, () => {
        widgetCalls++;
        if (widgetCalls === 1) {
          return HttpResponse.json(
            { error: { code: 401, message: "unauthorized", details: {} } },
            { status: 401 },
          );
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post(`${API}/auth/refresh`, () => {
        refreshCalls++;
        return HttpResponse.json({
          access_token: "fresh-token",
          token_type: "Bearer",
          expires_in: 900,
          user: USER,
        });
      }),
    );

    const res = await api.get("/widgets");
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(widgetCalls).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
  });

  it("401 with a DOMAIN key → thrown to caller, NO refresh", async () => {
    let refreshCalled = false;
    server.use(
      http.get(`${API}/widgets`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "invalid_credentials", details: {} } },
          { status: 401 },
        ),
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshCalled = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    await expect(api.get("/widgets")).rejects.toMatchObject({
      message: "invalid_credentials",
      code: 401,
    });
    expect(refreshCalled).toBe(false);
  });

  it("refresh fails → clears the session and rejects", async () => {
    useAuthStore.getState().setSession(USER, "stale-token");
    server.use(
      http.get(`${API}/widgets`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "unauthorized", details: {} } },
          { status: 401 },
        ),
      ),
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "unauthorized", details: {} } },
          { status: 401 },
        ),
      ),
    );

    await expect(api.get("/widgets")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
