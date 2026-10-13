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

    const table = within(await screen.findByTestId("admin-sessions-table"));
    expect(table.getByText("Jane Doe")).toBeInTheDocument();
    expect(table.getByText("127.0.0.1")).toBeInTheDocument();
  });

  it("repeats every row as a card, so a narrow column keeps the revoke action", async () => {
    // Below 960px of panel width the table is hidden and these cards are the
    // only list. Revoke is this screen's single action; losing it loses the
    // screen.
    signIn(["sessions.read", "sessions.revoke"]);
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json(pageOf([session()])),
      ),
    );
    renderPage();

    const cards = within(await screen.findByTestId("admin-sessions-cards"));
    expect(cards.getByText("Jane Doe")).toBeInTheDocument();
    expect(
      cards.getByRole("button", { name: /thu hồi|revoke/i }),
    ).toBeInTheDocument();
  });

  it("marks the current session on its own row, with no column that is blank for every other", async () => {
    // The old "Trạng thái" column only ever filled in for the viewer's own
    // session; it cost ~150px of a table that already overflowed.
    signIn(["sessions.read"]);
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json(
          pageOf([
            session({ current: true }),
            session({
              id: "s2",
              full_name: "John Roe",
              email: "john@velt.local.vn",
            }),
          ]),
        ),
      ),
    );
    renderPage();

    const table = within(await screen.findByTestId("admin-sessions-table"));
    expect(
      table.getByText(i18n.t("admin.sessions.current")),
    ).toBeInTheDocument();
    expect(
      table.queryByRole("columnheader", {
        name: i18n.t("admin.sessions.col.status"),
      }),
    ).not.toBeInTheDocument();
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

    const table = within(await screen.findByTestId("admin-sessions-table"));
    await user.click(table.getByRole("button", { name: /thu hồi|revoke/i }));
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

    const table = within(await screen.findByTestId("admin-sessions-table"));
    await user.click(table.getByRole("button", { name: /thu hồi|revoke/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/phiên hiện tại|current session/i),
    ).toBeInTheDocument();
  });
});
