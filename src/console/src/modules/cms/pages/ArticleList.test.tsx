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

import ArticleList from "./ArticleList";

const API = "http://localhost/api";

function articlesResult() {
  return {
    items: [
      {
        id: "a1",
        title: "First post",
        slug: "first-post",
        status: "draft",
        category: { id: "c1", name: "News", slug: "news" },
        author: { id: "u1", name: "Alice" },
        published_at: null,
        updated_at: "2026-06-10T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
  };
}

// The list fetches taxonomy for its filter options; stub them empty.
function taxonomyHandlers() {
  return [
    http.get(`${API}/cms/categories`, () => HttpResponse.json([])),
    http.get(`${API}/cms/tags/options`, () => HttpResponse.json([])),
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
        <MemoryRouter initialEntries={["/cms/articles"]}>
          <Routes>
            <Route path="/cms/articles" element={<ArticleList />} />
            <Route path="/cms/articles/new" element={<div>NEW EDITOR</div>} />
            <Route
              path="/cms/articles/:id"
              element={<div>EDITOR DETAIL</div>}
            />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = [
  "cms.article.view",
  "cms.article.create",
  "cms.article.edit",
  "cms.article.delete",
  "cms.article.review",
];
const ACTIONS = () => i18n.t("cms.articles.col.actions");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("ArticleList", () => {
  it("renders rows with title, status badge, category and author", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      ...taxonomyHandlers(),
    );
    renderPage();

    // Scoped to the table: the screen renders the desktop table and the mobile
    // card list together and lets CSS show one, so an unscoped query matches
    // each row twice.
    const table = await screen.findByTestId("cms-articles-table");
    expect(within(table).getByText("First post")).toBeInTheDocument();
    expect(within(table).getByText("first-post")).toBeInTheDocument();
    expect(
      within(table).getByText(i18n.t("content_status.draft")),
    ).toBeInTheDocument();
    expect(within(table).getByText("News")).toBeInTheDocument();
    expect(within(table).getByText("Alice")).toBeInTheDocument();
  });

  it("read-only viewer: no create button and no row actions", async () => {
    signIn(["cms.article.view"]);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      ...taxonomyHandlers(),
    );
    renderPage();

    await screen.findByTestId("cms-articles-table");
    expect(
      screen.queryByRole("button", { name: i18n.t("cms.articles.btn.create") }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("cms-articles-table")).queryByRole("button", {
        name: ACTIONS(),
      }),
    ).not.toBeInTheDocument();
  });

  it("create: button navigates to the new-article editor", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-articles-table");

    await user.click(
      screen.getByRole("button", { name: i18n.t("cms.articles.btn.create") }),
    );
    expect(await screen.findByText("NEW EDITOR")).toBeInTheDocument();
  });

  it("title link opens the editor for that article", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByTestId("cms-articles-table");
    await user.click(within(table).getByRole("link", { name: "First post" }));
    expect(await screen.findByText("EDITOR DETAIL")).toBeInTheDocument();
  });

  it("title and slug carry the full string as a tooltip (both truncate)", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      ...taxonomyHandlers(),
    );
    renderPage();

    const table = await screen.findByTestId("cms-articles-table");
    expect(
      within(table).getByRole("link", { name: "First post" }),
    ).toHaveAttribute("title", "First post");
    expect(within(table).getByText("first-post")).toHaveAttribute(
      "title",
      "first-post",
    );
  });

  it("sort: clicking the Title header refetches with a server-side sort param", async () => {
    signIn(MANAGER);
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${API}/cms/articles`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json(articlesResult());
      }),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-articles-table");
    // Default sort is -updated_at.
    await waitFor(() => expect(sorts[0]).toBe("-updated_at"));

    await user.click(
      screen.getByRole("button", { name: i18n.t("cms.articles.col.title") }),
    );
    await waitFor(() => expect(sorts).toContain("title"));
  });

  it("sort: the default column (Updated) can toggle to ascending", async () => {
    signIn(MANAGER);
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${API}/cms/articles`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json(articlesResult());
      }),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-articles-table");

    // Default is -updated_at (desc); clicking Updated must reach ascending
    // (regression: the default column used to be stuck on descending).
    await user.click(
      screen.getByRole("button", { name: i18n.t("cms.articles.col.updated") }),
    );
    await waitFor(() => expect(sorts).toContain("updated_at"));
  });

  it("delete: dropdown → ConfirmDialog → DELETE", async () => {
    signIn(MANAGER);
    let deleted = false;
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      http.delete(`${API}/cms/articles/a1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-articles-table");

    await user.click(
      within(screen.getByTestId("cms-articles-table")).getByRole("button", {
        name: ACTIONS(),
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: i18n.t("common.delete") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("common.delete") }),
    );

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("delete blocked: 409 surfaces an error toast", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(articlesResult()),
      ),
      http.delete(`${API}/cms/articles/a1`, () =>
        HttpResponse.json(
          { error: { code: 409, message: "invalid_status_transition" } },
          { status: 409 },
        ),
      ),
      ...taxonomyHandlers(),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-articles-table");

    await user.click(
      within(screen.getByTestId("cms-articles-table")).getByRole("button", {
        name: ACTIONS(),
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: i18n.t("common.delete") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("common.delete") }),
    );

    expect(
      await screen.findByText(i18n.t("errors.invalid_status_transition")),
    ).toBeInTheDocument();
  });
});
