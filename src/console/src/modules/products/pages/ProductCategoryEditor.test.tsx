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
    name_display: "Cộng tác",
    status: "draft",
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

// The translation view the server returns for a declared entity. `slug` is not
// in it: a product category resolves its URL against its own table.
function trView(values?: Record<string, unknown>) {
  return {
    entity: "product_category",
    entity_id: "c1",
    base_locale: "vi",
    locales: ["en"],
    translatable_fields: ["name", "description", "seo"],
    translations: values ? { en: { values, updated_at: "u" } } : {},
    requires_republish: false,
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
  it("renders every card and no parent selector", async () => {
    // The whole point of this screen vs the CMS one: the taxonomy is flat.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    renderAt("/product-categories/new");

    // One heading per card on the shared editor grid: content, placement, SEO.
    expect(
      await screen.findByText(i18n.t("products.categories.editor.basic")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("products.categories.editor.placement")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("products.categories.seo.heading")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Chuyên mục cha|Danh mục cha/),
    ).not.toBeInTheDocument();
  });

  it("create: no slug field at all — the server derives it from the name", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    renderAt("/product-categories/new");

    await screen.findByLabelText(/Tên danh mục/);
    expect(
      screen.queryByText(i18n.t("products.categories.editor.permalink")),
    ).not.toBeInTheDocument();
  });

  it("requires a name", async () => {
    signIn(MANAGER);
    const posted = vi.fn();
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [] }),
      ),
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
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [] }),
      ),
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
      sort_order: 0,
      seo: { title: "Giáo dục | VELT", description: "", keywords: "" },
    });
    // No slug key at all on create: the server derives it from the name.
    expect(posted.mock.calls[0][0]).not.toHaveProperty("slug");
  });

  // Saving a new category carries on editing it: the SEO and the translations
  // live on the edit screen. Only a delete goes back to the list.
  it("create: carries on to the edit screen, not back to the list", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
      http.post(`${API}/product-categories`, () =>
        HttpResponse.json(category(), { status: 201 }),
      ),
    );
    renderAt("/product-categories/new");

    await userEvent.type(
      await screen.findByLabelText(/Tên danh mục/),
      "Giáo dục",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    // The editor re-reads the created row: its stored name, not what was typed
    // into the create form, is what the field shows afterwards.
    expect(await screen.findByDisplayValue("Cộng tác")).toBeVisible();
  });

  // The list can show and filter a status; this is the only screen that can
  // set one.
  it("shows the stored status and PATCHes the one that was picked", async () => {
    signIn(MANAGER);
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
      http.patch(`${API}/product-categories/c1`, async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(category({ status: "archived" }));
      }),
    );
    renderAt("/product-categories/c1");

    await screen.findByDisplayValue("Cộng tác");
    const status = document.getElementById(
      "product-category-status",
    ) as HTMLElement;
    expect(status).toHaveTextContent(i18n.t("content_status.draft"));
    await userEvent.click(status);
    await userEvent.click(
      await screen.findByRole("option", {
        name: i18n.t("content_status.archived"),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() =>
      expect(patchBody).toMatchObject({ status: "archived" }),
    );
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
      expect(await screen.findByLabelText(/Tên danh mục/)).toHaveValue(
        "Cộng tác",
      ),
    );
    // The permalink is a locked row, not an input — it is an address people
    // already hold.
    expect(screen.getByText("cong-tac")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("cong-tac")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n.t("products.categories.col.sort_order")),
    ).toHaveValue(3);
    expect(
      screen.getByLabelText(i18n.t("products.categories.seo.title")),
    ).toHaveValue("Công cụ cộng tác | VELT");
  });

  it("translation: the English tab is written before the record itself", async () => {
    signIn(MANAGER);
    const calls: string[] = [];
    let putBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [category()] }),
      ),
      http.get(`${API}/translations/product_category/c1`, () =>
        HttpResponse.json(trView()),
      ),
      http.put(
        `${API}/translations/product_category/c1/en`,
        async ({ request }) => {
          calls.push("translation");
          putBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(trView({ name: "Collaboration" }));
        },
      ),
      http.patch(`${API}/product-categories/c1`, () => {
        calls.push("record");
        return HttpResponse.json(category());
      }),
    );
    renderAt("/product-categories/c1");

    await userEvent.click(await screen.findByRole("tab", { name: /English/ }));
    // The panel is labelled in the language being written, so this box is
    // "Name" and not "Tên danh mục".
    await userEvent.type(screen.getByLabelText("Name"), "Collaboration");
    // The Vietnamese form stays mounted behind it: switching language must not
    // throw away what is in it.
    expect(screen.getByLabelText(/Tên danh mục/)).toHaveValue("Cộng tác");

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(calls).toEqual(["translation", "record"]));
    expect(putBody).toMatchObject({ values: { name: "Collaboration" } });
  });

  it("reports an id that is not in the taxonomy", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    renderAt("/product-categories/missing");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  // The lists on screen answer in the language the console is read in. This
  // form is saved back into the Vietnamese row, so it must ask for that one
  // however the console is set.
  // The list is read in whatever language the console is in — but the FORM is
  // filled from `name`, the stored value, never from the translated
  // `name_display` beside it. Without that split, saving a category while
  // reading English would write the English name into the Vietnamese row.
  it("fills the form from the stored name, not the translated one", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/product-categories`, () =>
        HttpResponse.json({
          items: [
            category({ name: "Cộng tác", name_display: "Collaboration" }),
          ],
        }),
      ),
    );
    await i18n.changeLanguage("en");
    try {
      renderAt("/product-categories/c1");
      expect(await screen.findByDisplayValue("Cộng tác")).toBeInTheDocument();
      expect(
        screen.queryByDisplayValue("Collaboration"),
      ).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("vi");
    }
  });
});
