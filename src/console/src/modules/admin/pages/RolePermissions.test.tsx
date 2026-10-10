import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import RolePermissions from "./RolePermissions";

const API = "http://localhost/api";

const SUPER = {
  id: "r-super",
  code: "super_admin",
  name: "Super Admin",
  description: null,
  is_system: true,
  member_count: 1,
  permission_count: 0,
  updated_at: "2026-01-01T00:00:00Z",
};
const EDITOR = {
  id: "r-editor",
  code: "editor",
  name: "Editor",
  description: "Nội dung",
  is_system: true,
  member_count: 2,
  permission_count: 2,
  updated_at: "2026-01-01T00:00:00Z",
};

const CATALOG = [
  {
    resource: "users",
    permissions: [
      { id: "p1", code: "users.read", description: "Read users" },
      { id: "p2", code: "users.manage", description: "Manage users" },
    ],
  },
  {
    resource: "roles",
    permissions: [{ id: "p3", code: "roles.read", description: "Read roles" }],
  },
];

function mockRbac(roles: unknown[], detail: Record<string, unknown>) {
  server.use(
    // Detail (`:id`) registered before the list so MSW matches it first.
    http.get(`${API}/admin/roles/:id`, ({ params }) => {
      const r = detail[params.id as string];
      return r ? HttpResponse.json(r) : new HttpResponse(null, { status: 404 });
    }),
    http.get(`${API}/admin/roles`, () => HttpResponse.json(roles)),
    http.get(`${API}/admin/permissions`, () => HttpResponse.json(CATALOG)),
  );
}

function signIn() {
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
  useAuthStore
    .getState()
    .setAuthz(["admin"], ["roles.read", "permissions.read"]);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <RolePermissions />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().clear();
  signIn();
});
afterEach(() => useAuthStore.getState().clear());

describe("RolePermissions", () => {
  it("defaults to the first role and renders its permissions grouped, excluding super_admin", async () => {
    mockRbac([SUPER, EDITOR], {
      "r-editor": { ...EDITOR, permissions: ["users.read", "roles.read"] },
    });
    renderPage();

    // Editor is auto-selected; its two permissions render with descriptions.
    expect(await screen.findByText("Read users")).toBeInTheDocument();
    expect(screen.getByText("Read roles")).toBeInTheDocument();
    // Editor holds users.read but NOT users.manage.
    expect(screen.queryByText("Manage users")).not.toBeInTheDocument();
    // super_admin is kept out of the picker entirely.
    expect(screen.queryByText("Super Admin")).not.toBeInTheDocument();
  });

  it("shows an empty state when the selected role has no permissions", async () => {
    mockRbac([EDITOR], { "r-editor": { ...EDITOR, permissions: [] } });
    const { container } = renderPage();

    // Wait for the role list + its (empty) detail to settle, then assert.
    await new Promise((r) => setTimeout(r, 1500));
    expect(container.textContent).toMatch(
      /chưa có quyền nào|has no permissions/i,
    );
  });
});
