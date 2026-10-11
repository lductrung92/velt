import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ProductCategoryList from "./ProductCategoryList";

const API = "http://localhost/api";

function category(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    slug: "cong-tac",
    name: "Cộng tác",
    description: "Công cụ làm việc nhóm",
    sort_order: 0,
    product_count: 3,
    seo: { title: null, description: null, keywords: null },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const TWO = [
  category(),
  category({ id: "c2", slug: "ai-tu-dong-hoa", name: "AI & tự động hoá", sort_order: 1 }),
];

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@velt.local",
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
        <MemoryRouter initialEntries={["/product-categories"]}>
          <ProductCategoryList />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["products.view", "products.category.manage"];
const VIEWER = ["products.view"];

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("ProductCategoryList", () => {
  it("renders a table of name, slug and sort order", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: TWO }),
      ),
    );
    renderPage();

    const table = await screen.findByTestId("product-categories-table");
    expect(within(table).getByText("Cộng tác")).toBeInTheDocument();
    expect(within(table).getByText("cong-tac")).toBeInTheDocument();
    expect(within(table).getByText("AI & tự động hoá")).toBeInTheDocument();
    // Headers mirror the CMS taxonomy screen (no parent column — this is flat).
    expect(
      within(table).getByText(i18n.t("products.categories.col.sort_order")),
    ).toBeInTheDocument();
  });

  it("keeps rows in server order by default", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: TWO }),
      ),
    );
    renderPage();

    const rows = await screen.findAllByTestId("product-category-row");
    expect(rows[0]).toHaveTextContent("Cộng tác");
    expect(rows[1]).toHaveTextContent("AI & tự động hoá");
  });

  it("sorts by name when the column header is clicked", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: TWO }),
      ),
    );
    renderPage();

    await screen.findAllByTestId("product-category-row");
    await userEvent.click(
      screen.getByRole("button", { name: /Tên danh mục/ }),
    );

    const asc = screen.getAllByTestId("product-category-row");
    expect(asc[0]).toHaveTextContent("AI & tự động hoá");

    // Clicking again flips the direction.
    await userEvent.click(screen.getByRole("button", { name: /Tên danh mục/ }));
    const desc = screen.getAllByTestId("product-category-row");
    expect(desc[0]).toHaveTextContent("Cộng tác");
  });

  it("filters by the search term", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: TWO }),
      ),
    );
    renderPage();

    await screen.findAllByTestId("product-category-row");
    await userEvent.click(screen.getByRole("button", { name: i18n.t("common.filter") }));
    await userEvent.type(screen.getByLabelText(i18n.t("products.categories.search_label")), "ai");
    await userEvent.click(screen.getByRole("button", { name: i18n.t("common.apply") }));

    const rows = screen.getAllByTestId("product-category-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("AI & tự động hoá");
  });

  it("hides the drag handle while the list is sorted", async () => {
    // Reordering a sorted view would write an order the user never chose.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: TWO }),
      ),
    );
    renderPage();

    await screen.findAllByTestId("product-category-row");
    expect(
      screen.getAllByRole("button", { name: i18n.t("products.categories.reorder") }).length,
    ).toBe(2);

    await userEvent.click(screen.getByRole("button", { name: /Tên danh mục/ }));
    expect(
      screen.queryByRole("button", { name: i18n.t("products.categories.reorder") }),
    ).not.toBeInTheDocument();
  });

  it("hides every write affordance from a viewer", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
    );
    renderPage();

    await screen.findAllByTestId("product-category-row");
    expect(
      screen.queryByRole("button", { name: i18n.t("common.add_new") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.edit") }),
    ).not.toBeInTheDocument();
  });

  it("says deleting unlinks products rather than removing them", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("common.delete") }),
    );
    expect(
      await screen.findByText(
        i18n.t("products.categories.delete.description", {
          name: "Cộng tác",
          count: 3,
        }),
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    signIn(VIEWER);
    // 403, not 500: axios-retry re-sends 5xx three times with exponential
    // backoff, which outlives the assertion budget.
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json(
          { error: { code: 403, message: "access_denied", details: null } },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
