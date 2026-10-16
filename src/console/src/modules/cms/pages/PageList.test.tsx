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

import type { PageListItem, PageStatus } from "../services/pages.service";
import PageList from "./PageList";

const API = "http://localhost/api";
const t = (key: string) => i18n.t(key);

function page(
  id: string,
  title: string,
  slug: string,
  status: PageStatus = "draft",
  landing = false,
): PageListItem {
  return {
    id,
    title,
    slug,
    template: null,
    status,
    landing_id: landing ? "landing-" + id : null,
    published_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const PAGES = [
  page("p1", "Về chúng tôi", "ve-chung-toi", "published"),
  page("p2", "Đội ngũ", "doi-ngu"),
  page("p3", "Hồ sơ", "ho-so"),
  page("p4", "Trang đích", "trang-dich", "draft", true),
];

/**
 * The list is filtered and paginated by the SERVER now, so the handler does
 * what the server does — and records what it was asked, which is the only way
 * to tell "the filter was applied" from "the rows happened to match".
 */
function pagesHandler(all: PageListItem[] = PAGES) {
  const asked: URLSearchParams[] = [];
  const handler = http.get(`${API}/cms/pages`, ({ request }) => {
    const url = new URL(request.url);
    asked.push(url.searchParams);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    const landing = url.searchParams.get("landing") === "1";
    const size = Number(url.searchParams.get("page_size") ?? 20);
    const at = Number(url.searchParams.get("page") ?? 1);
    const rows = all
      .filter((p) => !status || p.status === status)
      .filter((p) => !landing || !!p.landing_id)
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q),
      );
    return HttpResponse.json({
      items: rows.slice((at - 1) * size, at * size),
      total: rows.length,
      page: at,
      page_size: size,
    });
  });
  return { handler, asked, last: () => asked[asked.length - 1] };
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
const rows = () => within(table()).getAllByTestId("cms-page-row");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("PageList", () => {
  it("lists one row per page, flat", async () => {
    // No depth, no parent: a page's address is one slug segment, so the list
    // has nothing to indent.
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    renderPage();

    await screen.findByTestId("cms-pages-table");
    expect(rows()).toHaveLength(4);
    expect(within(table()).getByText("Hồ sơ")).toBeInTheDocument();
  });

  it("asks the server for one page at a time", async () => {
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    renderPage();

    await screen.findByTestId("cms-pages-table");
    expect(api.last().get("page")).toBe("1");
    expect(Number(api.last().get("page_size"))).toBeGreaterThan(0);
  });

  it("takes the card counts from the server, not from the rows on screen", async () => {
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    renderPage();

    await screen.findByTestId("cms-pages-table");
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: new RegExp(t("cms.pages.overview.total")),
        }),
      ).toHaveTextContent("4"),
    );
    expect(
      screen.getByRole("button", {
        name: new RegExp(t("cms.pages.overview.landing")),
      }),
    ).toHaveTextContent("1");
  });

  it("sends the search to the server", async () => {
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("cms-pages-table");
    await user.type(
      screen.getByRole("searchbox", { name: t("cms.pages.search_label") }),
      "ho-so",
    );
    await waitFor(() => expect(api.last().get("q")).toBe("ho-so"));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(table()).getByText("Hồ sơ")).toBeInTheDocument();
  });

  it("sends the status tab to the server", async () => {
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("cms-pages-table");
    await user.click(
      within(
        screen.getByRole("group", { name: t("cms.pages.filter_status") }),
      ).getByRole("button", { name: t("content_status.draft") }),
    );
    await waitFor(() => expect(api.last().get("status")).toBe("draft"));
    await waitFor(() => expect(rows()).toHaveLength(3));
  });

  it("the landing card filters on a property, not on a status", async () => {
    signIn(MANAGER);
    const api = pagesHandler();
    server.use(api.handler);
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("cms-pages-table");
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(t("cms.pages.overview.landing")),
      }),
    );
    await waitFor(() => expect(api.last().get("landing")).toBe("1"));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(table()).getByText("Trang đích")).toBeInTheDocument();
  });

  it("an empty list offers the create action", async () => {
    signIn(MANAGER);
    const api = pagesHandler([]);
    server.use(api.handler);
    renderPage();

    expect(await screen.findByText(t("cms.pages.empty_title"))).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: t("common.add_new") }).length,
    ).toBeGreaterThan(0);
  });

  it("read-only viewer gets no create or delete control", async () => {
    signIn(["cms.page.view"]);
    const api = pagesHandler();
    server.use(api.handler);
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
