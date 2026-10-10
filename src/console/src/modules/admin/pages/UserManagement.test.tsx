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

import UserManagement from "./UserManagement";

const API = "http://localhost/api";

const ROW = {
  id: "u2",
  email: "jane@velt.local.vn",
  full_name: "Jane Doe",
  avatar_url: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
  roles: [{ id: "r1", code: "editor", name: "Editor" }],
  two_factor_enabled: false,
};

function pageOf(items: unknown[]) {
  return { items, total: items.length, page: 1, page_size: 10 };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UserManagement />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function signInWith(permissions: string[]) {
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

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("UserManagement", () => {
  it("renders the user list", async () => {
    signInWith(["users.read", "users.create"]);
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
    );
    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@velt.local.vn")).toBeInTheDocument();
  });

  it("renders a user with null roles without crashing (— placeholder)", async () => {
    signInWith(["users.read"]);
    // A user with no roles can arrive as `roles: null` (Go nil slice). The row
    // must render the em-dash, not throw "Cannot read 'length' of null".
    const noRoles = { ...ROW, id: "u3", full_name: "No Roles", roles: null };
    server.use(
      http.get(`${API}/admin/users`, () =>
        HttpResponse.json(pageOf([noRoles])),
      ),
    );
    renderPage();

    expect(await screen.findByText("No Roles")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides 'Add new' without users.create permission", async () => {
    signInWith(["users.read"]); // read-only
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
    );
    renderPage();

    await screen.findByText("Jane Doe");
    expect(
      screen.queryByRole("button", { name: /thêm mới|add new/i }),
    ).not.toBeInTheDocument();
  });

  it("create → 409 conflict shows inline email error, dialog stays open", async () => {
    signInWith(["users.read", "users.create"]);
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
      http.post(`${API}/admin/users`, () =>
        HttpResponse.json(
          { error: { code: 409, message: "conflict", details: {} } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /thêm mới|add new/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText(/email/i),
      "jane@velt.local.vn",
    );
    await user.type(
      within(dialog).getByLabelText(/họ tên|full name/i),
      "Jane Two",
    );
    // Submit button is the standard form footer "Lưu"/"Save".
    await user.click(
      within(dialog).getByRole("button", { name: /lưu|^save$/i }),
    );

    await waitFor(() =>
      expect(within(dialog).getByText(/trùng|conflict/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // still open
  });

  it("super_admin create form shows the role select", async () => {
    signInWith(["*"]); // super_admin
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
      http.get(`${API}/admin/roles`, () =>
        HttpResponse.json([
          {
            id: "r1",
            code: "editor",
            name: "Editor",
            description: null,
            is_system: true,
            member_count: 1,
            permission_count: 1,
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /thêm mới|add new/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/^vai trò$|^role$/i)).toBeInTheDocument();
  });

  it("non-super create form hides the role select", async () => {
    signInWith(["users.read", "users.create"]); // not super_admin
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /thêm mới|add new/i }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByText(/^vai trò$|^role$/i),
    ).not.toBeInTheDocument();
  });

  it("empty list → shared no-data row inside the table (header kept)", async () => {
    signInWith(["users.read", "users.create"]);
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([]))),
    );
    renderPage();

    expect(
      await screen.findByText(i18n.t("common.empty_state.default_title")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: i18n.t("admin.users.col.user"),
      }),
    ).toBeInTheDocument();
  });

  it("sorts by a column header: cycles asc → desc → default, sets aria-sort", async () => {
    signInWith(["users.read"]);
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${API}/admin/users`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json(pageOf([ROW]));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Jane Doe");

    // Default sort on first load.
    expect(sorts[0]).toBe("-created_at");

    const userLabel = i18n.t("admin.users.col.user");
    // The sort header re-renders on each click, so re-query the button each time.
    const clickUser = () =>
      user.click(screen.getByRole("button", { name: userLabel }));

    await clickUser(); // → asc
    await waitFor(() => expect(sorts.at(-1)).toBe("full_name"));
    expect(
      screen.getByRole("columnheader", { name: userLabel }),
    ).toHaveAttribute("aria-sort", "ascending");

    await clickUser(); // → desc
    await waitFor(() => expect(sorts.at(-1)).toBe("-full_name"));
    expect(
      screen.getByRole("columnheader", { name: userLabel }),
    ).toHaveAttribute("aria-sort", "descending");

    await clickUser(); // → idle (falls back to default)
    await waitFor(() => expect(sorts.at(-1)).toBe("-created_at"));
  });

  it("roles + actions columns are not sortable (no header button)", async () => {
    signInWith(["users.read"]);
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(pageOf([ROW]))),
    );
    renderPage();
    await screen.findByText("Jane Doe");

    expect(
      screen.queryByRole("button", { name: i18n.t("admin.users.col.roles") }),
    ).not.toBeInTheDocument();
  });
});
