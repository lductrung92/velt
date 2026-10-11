import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ProductCategoryEditor from "./ProductCategoryEditor";

const API = "http://localhost/api";

function category(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    slug: "cong-tac",
    name: "Cộng tác",
    description: "Công cụ làm việc nhóm",
    sort_order: 3,
    seo: {
      title: "Công cụ cộng tác | VELT",
      description: "Phần mềm làm việc nhóm",
      keywords: "cong tac",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
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

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/product-categories/new"
              element={<ProductCategoryEditor />}
            />
            <Route
              path="/product-categories/:id"
              element={<ProductCategoryEditor />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["products.view", "products.category.manage"];

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("ProductCategoryEditor", () => {
  it("renders both sections and no parent selector", async () => {
    // The whole point of this screen vs the CMS one: the taxonomy is flat.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () => HttpResponse.json({ items: [] })),
    );
    renderAt("/product-categories/new");

    // Each section label appears twice: once in the nav rail, once as the card
    // title — same as the CMS category editor.
    expect(
      await screen.findAllByText(i18n.t("products.categories.editor.basic")),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(i18n.t("products.categories.seo.heading")),
    ).toHaveLength(2);
    expect(screen.queryByText(/Chuyên mục cha|Danh mục cha/)).not.toBeInTheDocument();
  });

  it("requires a name", async () => {
    signIn(MANAGER);
    const posted = vi.fn();
    server.use(
      http.get(`${API}/product-categories`, () => HttpResponse.json({ items: [] })),
      http.post(`${API}/product-categories`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(category(), { status: 201 });
      }),
    );
    renderAt("/product-categories/new");

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("common.save") }),
    );
    expect(
      await screen.findByText(i18n.t("errors.validation.required")),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("sends name, sort order and the seo sub-object on create", async () => {
    signIn(MANAGER);
    const posted = vi.fn();
    server.use(
      http.get(`${API}/product-categories`, () => HttpResponse.json({ items: [] })),
      http.post(`${API}/product-categories`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(category(), { status: 201 });
      }),
    );
    renderAt("/product-categories/new");

    await userEvent.type(
      await screen.findByLabelText(/Tên danh mục/),
      "Giáo dục",
    );
    await userEvent.type(
      screen.getByLabelText(i18n.t("products.categories.seo.title")),
      "Giáo dục | VELT",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0][0]).toMatchObject({
      name: "Giáo dục",
      // Slug left blank: the server derives it.
      slug: "",
      sort_order: 0,
      seo: { title: "Giáo dục | VELT", description: "", keywords: "" },
    });
  });

  it("prefills every field when editing", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
    );
    renderAt("/product-categories/c1");

    await waitFor(async () =>
      expect(await screen.findByLabelText(/Tên danh mục/)).toHaveValue("Cộng tác"),
    );
    expect(screen.getByLabelText(/^Slug/)).toHaveValue("cong-tac");
    expect(
      screen.getByLabelText(i18n.t("products.categories.col.sort_order")),
    ).toHaveValue(3);
    expect(
      screen.getByLabelText(i18n.t("products.categories.seo.title")),
    ).toHaveValue("Công cụ cộng tác | VELT");
  });

  it("reports an id that is not in the taxonomy", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () => HttpResponse.json({ items: [] })),
    );
    renderAt("/product-categories/missing");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
