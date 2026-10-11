import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import AiAssistant from "./AiAssistant";

const API = "http://localhost/api";

function settingsPayload(over: Record<string, unknown> = {}) {
  return {
    groups: [
      {
        key: "ai",
        items: [
          { key: "ai.enabled", value: true },
          { key: "ai.provider", value: "anthropic" },
          { key: "ai.base_url", value: "" },
          { key: "ai.model", value: "claude-sonnet-5-5" },
          { key: "ai.daily_token_cap", value: 2000000 },
          { key: "ai.max_turns", value: 30 },
          { key: "ai.system_persona", value: "" },
          { key: "ai.api_key", type: "secret", is_set: true },
          ...(over.extra as unknown[] | undefined ?? []),
        ],
      },
    ],
  };
}

function status(over: Record<string, unknown> = {}) {
  return {
    live: true,
    reason: "",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    base_url: "",
    has_key: true,
    staff_online: 1,
    ...over,
  };
}

function stubAll() {
  return [
    http.get(`${API}/settings`, () => HttpResponse.json(settingsPayload())),
    http.get(`${API}/ai/status`, () => HttpResponse.json(status())),
    http.get(`${API}/ai/usage`, () =>
      HttpResponse.json({
        today_tokens_out: 1000,
        daily_cap: 2000000,
        days: [{ day: "2026-10-11", conversations: 3, tokens_in: 900, tokens_out: 1000 }],
      }),
    ),
    http.get(`${API}/mcp/tokens`, () => HttpResponse.json({ items: [] })),
  ];
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@zukatek.local",
      full_name: "Admin",
      avatar_url: null,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    },
    "tok",
  );
  useAuthStore.getState().setAuthz(["admin"], permissions);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/admin/ai"]}>
          <AiAssistant />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().clear();
  server.use(...stubAll());
});
afterEach(() => useAuthStore.getState().clear());

describe("AiAssistant", () => {
  it("leads with whether the assistant is actually running", async () => {
    signIn(["settings.manage"]);
    renderPage();
    const strip = await screen.findByTestId("ai-status-strip");
    expect(within(strip).getByText(i18n.t("ai.status.live"))).toBeInTheDocument();
  });

  it("names the reason when it is not running", async () => {
    // The failure this screen guards against is silent: a wrong key looks
    // exactly like a working configuration.
    signIn(["settings.manage"]);
    server.use(
      http.get(`${API}/ai/status`, () =>
        HttpResponse.json(status({ live: false, reason: "not_configured", has_key: false })),
      ),
    );
    renderPage();
    const strip = await screen.findByTestId("ai-status-strip");
    expect(
      within(strip).getByText(new RegExp(i18n.t("ai.status.reason.not_configured"))),
    ).toBeInTheDocument();
  });

  it("does not clear a working key when the field is left blank", async () => {
    // Sending "" would wipe a live credential. Leaving a field alone must mean
    // leaving it alone.
    signIn(["settings.manage"]);
    const saved = vi.fn();
    server.use(
      http.put(`${API}/settings`, async ({ request }) => {
        saved(await request.json());
        return HttpResponse.json({});
      }),
    );
    renderPage();

    await screen.findByTestId("ai-status-strip");
    await userEvent.click(
      (await screen.findAllByRole("button", { name: i18n.t("common.save") }))[0],
    );

    await waitFor(() => expect(saved).toHaveBeenCalled());
    const body = saved.mock.calls[0][0] as { updates: Record<string, unknown> };
    expect(body.updates).not.toHaveProperty("ai.api_key");
  });

  it("sends the key only when one was typed", async () => {
    signIn(["settings.manage"]);
    const saved = vi.fn();
    server.use(
      http.put(`${API}/settings`, async ({ request }) => {
        saved(await request.json());
        return HttpResponse.json({});
      }),
    );
    renderPage();

    await userEvent.type(
      await screen.findByLabelText(i18n.t("ai.field.api_key")),
      "sk-ant-moi",
    );
    await userEvent.click(
      (await screen.findAllByRole("button", { name: i18n.t("common.save") }))[0],
    );

    await waitFor(() => expect(saved).toHaveBeenCalled());
    const body = saved.mock.calls[0][0] as { updates: Record<string, string> };
    expect(body.updates["ai.api_key"]).toBe("sk-ant-moi");
  });

  it("warns loudly when the model will not call tools", async () => {
    // Without tool calling the assistant answers from imagination instead of
    // the catalog — a broken guarantee, not a quality dip.
    signIn(["settings.manage"]);
    server.use(
      http.post(`${API}/ai/test`, () =>
        HttpResponse.json({
          ok: true,
          tool_calling: false,
          model: "llama3.1:8b",
          provider: "openai",
          latency_ms: 820,
        }),
      ),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("ai.test.run") }),
    );
    expect(await screen.findByText(i18n.t("ai.test.no_tools"))).toBeInTheDocument();
  });

  it("reports a passing test", async () => {
    signIn(["settings.manage"]);
    server.use(
      http.post(`${API}/ai/test`, () =>
        HttpResponse.json({
          ok: true,
          tool_calling: true,
          model: "claude-sonnet-5-5",
          provider: "anthropic",
          latency_ms: 500,
        }),
      ),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("ai.test.run") }),
    );
    expect(await screen.findByText(i18n.t("ai.test.passed"))).toBeInTheDocument();
  });

  it("shows spend against the cap", async () => {
    signIn(["settings.manage"]);
    renderPage();
    const usage = await screen.findByTestId("ai-usage");
    expect(within(usage).getByText(i18n.t("ai.usage.today"))).toBeInTheDocument();
    expect(usage.querySelector('[data-testid="ai-usage-bar"]')).toBeInTheDocument();
  });

  it("warns when the cap is nearly spent", async () => {
    signIn(["settings.manage"]);
    server.use(
      http.get(`${API}/ai/usage`, () =>
        HttpResponse.json({ today_tokens_out: 95, daily_cap: 100, days: [] }),
      ),
    );
    renderPage();
    expect(await screen.findByText(i18n.t("ai.usage.near_cap"))).toBeInTheDocument();
  });

  it("shows an MCP secret once, with a warning", async () => {
    signIn(["settings.manage"]);
    server.use(
      http.post(`${API}/mcp/tokens`, () =>
        HttpResponse.json({
          token: {
            id: "t1",
            user_id: "admin-1",
            label: "Claude Desktop",
            hint: "zkt_mcp_abc123",
            last_used_at: null,
            revoked_at: null,
            created_at: "2026-10-11T00:00:00Z",
          },
          secret: "zkt_mcp_abc123def456",
          shown_once: true,
        }),
      ),
    );
    renderPage();

    await userEvent.type(
      await screen.findByLabelText(i18n.t("ai.mcp.label")),
      "Claude Desktop",
    );
    await userEvent.click(screen.getByRole("button", { name: i18n.t("ai.mcp.issue") }));

    expect(await screen.findByText(i18n.t("ai.mcp.shown_once"))).toBeInTheDocument();
    expect(screen.getByText("zkt_mcp_abc123def456")).toBeInTheDocument();
  });

  it("surfaces a load failure instead of rendering an empty form", async () => {
    signIn(["settings.manage"]);
    // 403 rather than 500: axios-retry re-sends 5xx with backoff, which
    // outlives the assertion budget.
    server.use(
      http.get(`${API}/settings`, () =>
        HttpResponse.json(
          { error: { code: 403, message: "access_denied", details: null } },
          { status: 403 },
        ),
      ),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
