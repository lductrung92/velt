import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import CategoryTree from "./CategoryTree";

const API = "http://localhost/api";

function emptySeo() {
  return { title: null, description: null, keywords: null };
}

// Tin tức › Sự kiện, plus Hướng dẫn at root.
function catTree() {
  return [
    {
      id: "a",
      name: "Tin tức",
      slug: "tin-tuc",
      parent_id: null,
      description: null,
      sort_order: 0,
      article_count: 2,
      seo: emptySeo(),
      children: [
        {
          id: "a1",
          name: "Sự kiện",
          slug: "su-kien",
          parent_id: "a",
          description: null,
          sort_order: 0,
          article_count: 0,
          seo: emptySeo(),
          children: [],
          created_at: "x",
          updated_at: "u-a1",
        },
      ],
      created_at: "x",
      updated_at: "u-a",
    },
    {
      id: "b",
      name: "Hướng dẫn",
      slug: "huong-dan",
      parent_id: null,
      description: null,
      sort_order: 1,
      article_count: 0,
      seo: emptySeo(),
      children: [],
      created_at: "x",
      updated_at: "u-b",
    },
  ];
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
        <MemoryRouter initialEntries={["/cms/categories"]}>
          <Routes>
            <Route path="/cms/categories" element={<CategoryTree />} />
            <Route
              path="/cms/categories/new"
              element={<div>NEW CATEGORY EDITOR</div>}
            />
            <Route
              path="/cms/categories/:id"
              element={<div>CATEGORY EDITOR</div>}
            />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["cms.article.view", "cms.taxonomy.manage"];
const ADD = () => i18n.t("common.add_new");
const EDIT = () => i18n.t("common.edit");
const DELETE = () => i18n.t("common.delete");
const REORDER = () => i18n.t("cms.categories.reorder");

// The desktop table and the mobile card list both render; CSS picks one. Row
// queries are scoped to the table so a match is not counted twice.
const table = () => screen.getByTestId("cms-categories-table");
const inTable = () => within(table());
const ready = () => screen.findByTestId("cms-categories-table");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("CategoryTree", () => {
  it("renders the tree (parent, child, root sibling) with slugs", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    renderPage();

    await ready();
    expect(inTable().getByText("Tin tức")).toBeInTheDocument();
    expect(inTable().getByText("Sự kiện")).toBeInTheDocument();
    expect(inTable().getByText("Hướng dẫn")).toBeInTheDocument();
    expect(inTable().getByText("tin-tuc")).toBeInTheDocument();
  });

  it("read-only viewer: no Add, no row actions, no drag handle", async () => {
    signIn(["cms.article.view"]);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    renderPage();

    await ready();
    expect(
      screen.queryByRole("button", { name: ADD() }),
    ).not.toBeInTheDocument();
    expect(
      inTable().queryByRole("button", { name: EDIT() }),
    ).not.toBeInTheDocument();
    expect(
      inTable().queryByRole("button", { name: DELETE() }),
    ).not.toBeInTheDocument();
    expect(
      inTable().queryByRole("button", { name: REORDER() }),
    ).not.toBeInTheDocument();
  });

  it("manager: each row exposes a drag handle for reordering", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    renderPage();

    await ready();
    // 3 nodes → 3 reorder handles.
    expect(inTable().getAllByRole("button", { name: REORDER() })).toHaveLength(
      3,
    );
  });

  it("create: Add navigates to the new-category editor", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(screen.getByRole("button", { name: ADD() }));
    expect(await screen.findByText("NEW CATEGORY EDITOR")).toBeInTheDocument();
  });

  it("edit: Pencil navigates to the category editor", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(screen.getAllByRole("button", { name: EDIT() })[0]);
    expect(await screen.findByText("CATEGORY EDITOR")).toBeInTheDocument();
  });

  it("delete: row action → ConfirmDialog → DELETE", async () => {
    signIn(MANAGER);
    let deleted = false;
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
      http.delete(`${API}/cms/categories/a`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(screen.getAllByRole("button", { name: DELETE() })[0]);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: DELETE() }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("delete blocked: 409 category_in_use surfaces an error and keeps the dialog open", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
      http.delete(`${API}/cms/categories/a`, () =>
        HttpResponse.json(
          { error: { code: 409, message: "category_in_use" } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(screen.getAllByRole("button", { name: DELETE() })[0]);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: DELETE() }));

    expect(
      await screen.findByText(i18n.t("errors.category_in_use")),
    ).toBeInTheDocument();
    // Error path doesn't close the confirm dialog.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("filter: searching by name shows only matching rows", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    // The search box is now in the toolbar and filters as you type — the whole
    // tree is already in memory, so there is nothing to wait for.
    await user.type(
      screen.getByRole("searchbox", {
        name: i18n.t("cms.categories.search_label"),
      }),
      "Sự",
    );

    expect(inTable().getByText("Sự kiện")).toBeInTheDocument();
    expect(inTable().queryByText("Tin tức")).not.toBeInTheDocument();
    expect(inTable().queryByText("Hướng dẫn")).not.toBeInTheDocument();
    // Narrowing the list parks the drag handles: a reorder inside a filtered
    // subset would write a sort_order the user cannot see.
    expect(
      inTable().queryAllByRole("button", { name: REORDER() }),
    ).toHaveLength(0);
  });

  it("overview card: 'empty' narrows to categories with no articles", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(i18n.t("cms.categories.overview.unused")),
      }),
    );

    // Only the categories carrying no articles survive, and the tree collapses
    // to a flat list for the same reason a search does.
    const names = inTable()
      .getAllByTestId("cms-category-row")
      .map((r) => r.querySelector(".category-name strong")?.textContent);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain("Tin tức");
    expect(
      inTable().queryAllByRole("button", { name: REORDER() }),
    ).toHaveLength(0);
    expect(
      screen.getByText(i18n.t("cms.categories.flat_notice")),
    ).toBeInTheDocument();
  });

  it("sort: clicking the Name header switches to a flat sorted view (drag off)", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    );
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.click(
      screen.getByRole("button", { name: i18n.t("cms.categories.col.name") }),
    );

    // Flat view → no drag handles.
    expect(
      inTable().queryAllByRole("button", { name: REORDER() }),
    ).toHaveLength(0);
    // Sorted ascending by name: Hướng dẫn, Sự kiện, Tin tức.
    const rows = inTable().getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Hướng dẫn");
    expect(rows[1]).toHaveTextContent("Sự kiện");
    expect(rows[2]).toHaveTextContent("Tin tức");
  });
});
