import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import Sessions from "./Sessions";

const API = "http://localhost/api";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    user_id: "u1",
    full_name: "Jane Doe",
    email: "jane@velt.local.vn",
    user_agent: "Mozilla/5.0 Chrome/120 Windows",
    ip: "127.0.0.1",
    created_at: "2026-01-01T00:00:00Z",
    last_used_at: null,
    expires_at: "2026-02-01T00:00:00Z",
    current: false,
    is_last_super_admin: false,
    ...overrides,
  };
}

function pageOf(items: unknown[]) {
  return { items, total: items.length, page: 1, page_size: 10 };
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@velt.local.vn",
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
        <MemoryRouter>
          <Sessions />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("Sessions", () => {
  it("lists sessions", async () => {
    signIn(["sessions.read"]);
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json(pageOf([session()])),
      ),
    );
    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1")).toBeInTheDocument();
  });

  it("revoke → confirm → DELETE → dialog closes", async () => {
    signIn(["sessions.read", "sessions.revoke"]);
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json(pageOf([session()])),
      ),
      http.delete(
        `${API}/admin/sessions/s1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /thu hồi|revoke/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: /thu hồi|revoke/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("revoking the current session shows a warning", async () => {
    signIn(["sessions.read", "sessions.revoke"]);
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json(pageOf([session({ current: true })])),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Jane Doe");
    await user.click(
      screen.getAllByRole("button", { name: /thu hồi|revoke/i })[0],
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/phiên hiện tại|current session/i),
    ).toBeInTheDocument();
  });
});
