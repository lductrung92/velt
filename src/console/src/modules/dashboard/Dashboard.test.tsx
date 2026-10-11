import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import Dashboard from "./Dashboard";

const API = "http://localhost/api";
const t = (key: string) => i18n.t(key);

function renderDashboard(permissions: string[]) {
  useAuthStore.getState().setAuthz([], permissions);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(() => useAuthStore.getState().clear());

describe("Dashboard", () => {
  it("uses server totals, counts nested pages and links to recent records", async () => {
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("sort")).toBe(
          "-updated_at",
        );
        return HttpResponse.json({
          total: 14,
          items: [
            {
              id: "p1",
              name: "Inventory",
              status: "draft",
              lifecycle: "building",
              updated_at: "2026-10-10T00:00:00Z",
            },
          ],
        });
      }),
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json({
          total: 23,
          items: [
            {
              id: "a1",
              title: "News",
              status: "published",
              updated_at: "2026-10-10T00:00:00Z",
            },
          ],
        }),
      ),
      http.get(`${API}/members`, () =>
        HttpResponse.json({ total: 5, items: [] }),
      ),
      http.get(`${API}/cms/pages`, () =>
        HttpResponse.json([
          { id: "root", children: [{ id: "child", children: [] }] },
        ]),
      ),
    );
    renderDashboard(["*"]);
    expect(
      await screen.findByRole("link", { name: /Inventory/ }),
    ).toHaveAttribute("href", "/products/p1");
    expect(await screen.findByRole("link", { name: /News/ })).toHaveAttribute(
      "href",
      "/cms/articles/a1",
    );
    const cards = screen
      .getAllByRole("link")
      .filter((link) => link.textContent?.includes(t("dashboard.manage")));
    expect(cards.map((card) => card.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("14"),
        expect.stringContaining("23"),
        expect.stringContaining("2"),
        expect.stringContaining("5"),
      ]),
    );
    expect(
      screen.getByRole("link", { name: t("dashboard.actions.product") }),
    ).toHaveAttribute("href", "/products/new");
  });

  it("does not request protected module data or show actions without permission", async () => {
    let requests = 0;
    server.use(
      http.get(`${API}/*`, () => {
        requests++;
        return HttpResponse.json([]);
      }),
    );
    renderDashboard([]);
    expect(screen.getByText(t("dashboard.no_access"))).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it("shows real zero totals for empty data and an error instead of a fake zero", async () => {
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({ total: 0, items: [] }),
      ),
      http.get(`${API}/cms/articles`, () =>
        HttpResponse.json(
          { error: { message: "server_error", code: 500 } },
          { status: 500 },
        ),
      ),
    );
    renderDashboard(["products.view", "cms.article.view"]);
    expect(
      await screen.findByRole("alert", {}, { timeout: 5000 }),
    ).toHaveTextContent(t("dashboard.load_error"));
    const productCard = screen
      .getAllByRole("link")
      .find(
        (link) =>
          link.getAttribute("href") === "/products" &&
          link.textContent?.includes(t("dashboard.manage")),
      )!;
    expect(within(productCard).getByText("0")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: t("dashboard.quick_title") }),
    ).not.toBeInTheDocument();
  });
});
