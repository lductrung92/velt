import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(await screen.findByText("users.read")).toBeInTheDocument();
    expect(screen.getByText("roles.read")).toBeInTheDocument();
    // Editor holds users.read but NOT users.manage.
    expect(screen.queryByText("users.manage")).not.toBeInTheDocument();
    // super_admin is kept out of the picker entirely.
    expect(screen.queryByText("Super Admin")).not.toBeInTheDocument();
  });

  it("shows an empty state when the selected role has no permissions", async () => {
    mockRbac([EDITOR], { "r-editor": { ...EDITOR, permissions: [] } });
    renderPage();
    expect(
      await screen.findByText(/chưa có quyền nào|has no permissions/i),
    ).toBeInTheDocument();
  });

  it("clears permission search when switching roles and renders the new role's rights", async () => {
    const viewer = {
      ...EDITOR,
      id: "r-viewer",
      name: "Viewer",
      code: "viewer",
    };
    mockRbac([EDITOR, viewer], {
      "r-editor": { ...EDITOR, permissions: ["users.read", "roles.read"] },
      "r-viewer": { ...viewer, permissions: ["users.manage"] },
    });
    renderPage();
    await screen.findByText("roles.read");
    const user = userEvent.setup();
    const search = screen.getByRole("textbox", {
      name: /Tìm quyền|Find a permission/i,
    });
    await user.type(search, "roles.read");
    expect(screen.queryByText("users.read")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Viewer/ }));
    expect(await screen.findByText("users.manage")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /Tìm quyền|Find a permission/i }),
    ).toHaveValue("");
    expect(screen.queryByText("roles.read")).not.toBeInTheDocument();
  });

  it("finds a normally collapsed permission and restores the list after a no-match search", async () => {
    const permissions = [
      "users.read",
      "users.manage",
      "users.create",
      "users.update",
      "users.delete",
      "users.assign_role",
    ];
    mockRbac([EDITOR], { "r-editor": { ...EDITOR, permissions } });
    renderPage();
    await screen.findByText("users.read");
    expect(screen.queryByText("users.assign_role")).not.toBeInTheDocument();
    const user = userEvent.setup();
    const search = screen.getByRole("textbox", {
      name: /Tìm quyền|Find a permission/i,
    });
    await user.type(search, "USERS.ASSIGN_ROLE");
    expect(screen.getByText("users.assign_role")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "does-not-exist");
    expect(
      screen.getByText(/Không tìm thấy quyền phù hợp|No matching permissions/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /Xóa tìm kiếm|Clear search/i })[0],
    );
    expect(screen.getByText("users.read")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Xem thêm|Show more/i }),
    );
    expect(screen.getByText("users.assign_role")).toBeInTheDocument();
  });

  it("distinguishes an empty role directory from a role with no permissions", async () => {
    mockRbac([SUPER], {});
    renderPage();
    expect(
      await screen.findByText(
        /Chưa có vai trò để hiển thị|No roles to display/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/chưa có quyền nào|has no permissions/i),
    ).not.toBeInTheDocument();
  });

  it("shows a catalog error instead of an empty permission set", async () => {
    mockRbac([EDITOR], {
      "r-editor": { ...EDITOR, permissions: ["users.read"] },
    });
    server.use(
      http.get(
        `${API}/admin/permissions`,
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: /Thử lại|Try again/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/chưa có quyền nào|has no permissions/i),
    ).not.toBeInTheDocument();
  });
});
