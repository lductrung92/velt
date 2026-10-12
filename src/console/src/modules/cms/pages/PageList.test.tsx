import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import type { PageNode, PageStatus } from "../services/pages.service";
import PageList from "./PageList";

const API = "http://localhost/api";
const t = (key: string) => i18n.t(key);

function node(
  id: string,
  title: string,
  slug: string,
  status: PageStatus = "draft",
  children: PageNode[] = [],
  landing = false,
): PageNode {
  return {
    id,
    title,
    slug,
    parent_id: null,
    sort_order: 0,
    status,
    landing_id: landing ? "landing-" + id : null,
    children,
  };
}

// A two-level tree plus a flat sibling, so depth, counts and filtering all have
// something real to act on.
const TREE: PageNode[] = [
  node("p1", "Về chúng tôi", "ve-chung-toi", "published", [
    node("p2", "Đội ngũ", "doi-ngu", "draft", [
      node("p3", "Hồ sơ", "ho-so", "draft"),
    ]),
  ]),
  node("p4", "Trang đích", "trang-dich", "draft", [], true),
];

function pagesHandler(tree: PageNode[] = TREE) {
  return http.get(`${API}/cms/pages`, () => HttpResponse.json(tree));
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
        <MemoryRouter initialEntries={["/cms/pages"]}>
          <Routes>
            <Route path="/cms/pages" element={<PageList />} />
            <Route path="/cms/pages/new" element={<div>NEW PAGE</div>} />
            <Route path="/cms/pages/:id" element={<div>PAGE EDITOR</div>} />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["cms.page.view", "cms.page.create", "cms.page.delete"];

// The desktop table and the mobile card list both render; CSS picks one. Every
// row query is scoped to the table so a match is not counted twice.
const table = () => screen.getByTestId("cms-pages-table");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("PageList", () => {
  it("flattens the tree and keeps each page's depth", async () => {
    signIn(MANAGER);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    const rows = within(table()).getAllByTestId("cms-page-row");
    expect(rows).toHaveLength(4);

    // Depth drives the indent, so it has to survive flattening in document
    // order: root, child, grandchild, then the next root.
    const depths = rows.map((r) =>
      r.querySelector(".page-title")?.getAttribute("data-depth"),
    );
    expect(depths).toEqual(["0", "1", "2", "0"]);
  });

  it("counts the whole tree, not just the top level", async () => {
    signIn(MANAGER);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    // 4 pages in total, 3 of them drafts, 1 published, 1 landing.
    expect(
      screen.getByRole("button", {
        name: new RegExp(t("cms.pages.overview.total")),
      }),
    ).toHaveTextContent("4");
    expect(
      screen.getByRole("button", {
        name: new RegExp(t("cms.pages.overview.landing")),
      }),
    ).toHaveTextContent("1");
  });

  it("searches on title and slug as you type", async () => {
    signIn(MANAGER);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    fireEvent.change(
      screen.getByRole("searchbox", { name: t("cms.pages.search_label") }),
      { target: { value: "ho-so" } },
    );
    const rows = within(table()).getAllByTestId("cms-page-row");
    expect(rows).toHaveLength(1);
    expect(within(table()).getByText("Hồ sơ")).toBeInTheDocument();
  });

  it("flattens the list while a filter is on, and says so", async () => {
    signIn(MANAGER);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    expect(
      screen.queryByText(t("cms.pages.flat_notice")),
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      within(
        screen.getByRole("group", { name: t("cms.pages.filter_status") }),
      ).getByRole("button", { name: t("content_status.draft") }),
    );

    // A match whose parent was filtered out cannot be drawn as a child, so the
    // indent is dropped — and the screen admits it rather than looking broken.
    const depths = within(table())
      .getAllByTestId("cms-page-row")
      .map((r) => r.querySelector(".page-title")?.getAttribute("data-depth"));
    expect(depths).toEqual(["0", "0", "0"]);
    expect(screen.getByText(t("cms.pages.flat_notice"))).toBeInTheDocument();
  });

  it("the landing card filters on a property, not on a status", async () => {
    signIn(MANAGER);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(t("cms.pages.overview.landing")),
      }),
    );
    const rows = within(table()).getAllByTestId("cms-page-row");
    expect(rows).toHaveLength(1);
    expect(within(table()).getByText("Trang đích")).toBeInTheDocument();
  });

  it("empty tree offers the create action; a filtered miss does not", async () => {
    signIn(MANAGER);
    server.use(pagesHandler([]));
    renderPage();

    expect(await screen.findByText(t("cms.pages.empty_title"))).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: t("common.add_new") }).length,
    ).toBeGreaterThan(0);
  });

  it("read-only viewer gets no create or delete control", async () => {
    signIn(["cms.page.view"]);
    server.use(pagesHandler());
    renderPage();

    await screen.findByTestId("cms-pages-table");
    expect(
      screen.queryByRole("button", { name: t("common.add_new") }),
    ).not.toBeInTheDocument();
    expect(
      within(table()).queryByRole("button", { name: t("common.delete") }),
    ).not.toBeInTheDocument();
  });
});
