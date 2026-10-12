import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ProductList from "./ProductList";

const API = "http://localhost/api";

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    slug: "bang-cong-viec",
    name: "Bảng công việc",
    summary: "Không gian sắp xếp công việc.",
    cover_url: null,
    status: "draft",
    lifecycle: "building",
    version: "0.9.0",
    released_at: "2026-03-01",
    is_featured: false,
    sort_order: 0,
    updated_at: "2026-10-01T00:00:00Z",
    published_at: null,
    ...over,
  };
}

function page(items: unknown[]) {
  return { items, total: items.length, page: 1, page_size: 20 };
}

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
        <MemoryRouter initialEntries={["/products"]}>
          <ProductList />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const FULL = [
  "products.view",
  "products.create",
  "products.edit",
  "products.delete",
  "products.publish",
];
const VIEWER = ["products.view"];

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("ProductList", () => {
  it("shows status and lifecycle as two separate badges", async () => {
    // The pair is the product state; collapsing them would lose information.
    signIn(VIEWER);
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(page([product()]))),
    );
    renderPage();

    const row = await screen.findByTestId("product-row");
    expect(within(row).getByText("Bảng công việc")).toBeInTheDocument();
    expect(
      within(row).getByText(i18n.t("products.status.draft")),
    ).toBeInTheDocument();
    expect(
      within(row).getByText(i18n.t("products.lifecycle.building")),
    ).toBeInTheDocument();
  });

  it("renders a published idea without contradiction", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json(
          page([product({ status: "published", lifecycle: "idea" })]),
        ),
      ),
    );
    renderPage();

    const row = await screen.findByTestId("product-row");
    expect(
      within(row).getByText(i18n.t("products.status.published")),
    ).toBeInTheDocument();
    expect(
      within(row).getByText(i18n.t("products.lifecycle.idea")),
    ).toBeInTheDocument();
  });

  it("hides create and delete from a viewer", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(page([product()]))),
    );
    renderPage();

    await screen.findByTestId("product-row");
    expect(
      screen.queryByRole("button", { name: i18n.t("common.add_new") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.delete") }),
    ).not.toBeInTheDocument();
  });

  it("sends the status filter and resets to page 1", async () => {
    signIn(FULL);
    const seen: string[] = [];
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(page([product()]));
      }),
    );
    renderPage();
    await screen.findByTestId("product-row");

    // Status moved out of the popover and onto the tab row.
    await userEvent.click(
      within(
        screen.getByRole("group", { name: i18n.t("products.filter_status") }),
      ).getByRole("button", { name: i18n.t("products.status.published") }),
    );

    await waitFor(() =>
      expect(seen.some((s) => s.includes("status=published"))).toBe(true),
    );
    expect(seen[seen.length - 1]).toContain("page=1");
  });

  it("shows an applied filter as a removable chip", async () => {
    signIn(FULL);
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(page([product()]))),
    );
    renderPage();
    await screen.findByTestId("product-row");

    await userEvent.type(
      screen.getByRole("searchbox", { name: i18n.t("products.search_label") }),
      "bảng{Enter}",
    );

    expect(await screen.findByText(/bảng/)).toBeInTheDocument();
  });

  it("warns that deleting also removes the images, and points at Archive", async () => {
    signIn(FULL);
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(page([product()]))),
    );
    renderPage();

    // Scoped to the table: the desktop rows and the mobile cards both render,
    // so each row's delete button exists twice.
    const table = await screen.findByTestId("products-table");
    await userEvent.click(
      within(table).getByRole("button", { name: i18n.t("common.delete") }),
    );
    expect(
      await screen.findByText(
        i18n.t("products.delete.description", { name: "Bảng công việc" }),
      ),
    ).toBeInTheDocument();
  });

  it("calls DELETE on confirm", async () => {
    signIn(FULL);
    const deleted = vi.fn();
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json(page([product()]))),
      http.delete(`${API}/products/p1`, () => {
        deleted();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    // Scoped to the table: the desktop rows and the mobile cards both render,
    // so each row's delete button exists twice.
    const table = await screen.findByTestId("products-table");
    await userEvent.click(
      within(table).getByRole("button", { name: i18n.t("common.delete") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("common.delete") }),
    );
    await waitFor(() => expect(deleted).toHaveBeenCalled());
  });

  it("surfaces a load failure", async () => {
    signIn(VIEWER);
    // 403, not 500: axios-retry re-sends 5xx three times with exponential
    // backoff, which outlives the assertion budget.
    server.use(
      http.get(`${API}/products`, () =>
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
