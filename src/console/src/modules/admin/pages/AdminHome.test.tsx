import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import AdminHome from "./AdminHome";

const API = "http://localhost/api";

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
          <AdminHome />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("AdminHome", () => {
  it("renders the count cards from list totals", async () => {
    signIn(["users.read", "sessions.read", "roles.read"]);
    server.use(
      http.get(`${API}/admin/users`, () =>
        HttpResponse.json({ items: [], total: 5, page: 1, page_size: 1 }),
      ),
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json({ items: [], total: 3, page: 1, page_size: 1 }),
      ),
      http.get(`${API}/admin/roles`, () =>
        HttpResponse.json([
          {
            id: "r1",
            code: "admin",
            name: "Admin",
            description: null,
            is_system: true,
            member_count: 1,
            permission_count: 1,
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "r2",
            code: "editor",
            name: "Editor",
            description: null,
            is_system: true,
            member_count: 0,
            permission_count: 1,
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("hides count cards the actor has no permission for", async () => {
    signIn(["sessions.read"]); // only sessions
    server.use(
      http.get(`${API}/admin/sessions`, () =>
        HttpResponse.json({ items: [], total: 7, page: 1, page_size: 1 }),
      ),
    );
    renderPage();

    expect(await screen.findByText("7")).toBeInTheDocument();
    // Sessions count card present; users count card hidden (no users.read).
    expect(
      screen.getByText(/phiên đang hoạt động|active sessions/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^người dùng$|^users$/i),
    ).not.toBeInTheDocument();
  });
});
