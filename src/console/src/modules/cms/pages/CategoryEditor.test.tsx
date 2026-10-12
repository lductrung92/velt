import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import CategoryEditor from "./CategoryEditor";

const API = "http://localhost/api";

function emptySeo() {
  return { title: null, description: null, keywords: null };
}

// Tin tức (a) › Sự kiện (a1); Hướng dẫn (b). The tree is the only source of a
// category's detail (no per-id GET).
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
  ];
}

function settingsView(allowSlugEdit = true) {
  return {
    cms: [
      {
        key: "cms.article.allow_slug_edit",
        type: "bool",
        value: allowSlugEdit,
      },
    ],
  };
}

function baseHandlers() {
  return [
    http.get(`${API}/cms/categories`, () => HttpResponse.json(catTree())),
    http.get(`${API}/cms/settings`, () => HttpResponse.json(settingsView())),
    http.get(`${API}/public/settings`, () =>
      HttpResponse.json({ "translation.enabled": false }),
    ),
  ];
}

// The translation view the server returns for a declared entity. `slug` is not
// in it: a category resolves its URL against its own table.
function trView(values?: Record<string, unknown>) {
  return {
    entity: "cms_category",
    entity_id: "a",
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

function renderEditor(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/cms/categories" element={<div>CATEGORY LIST</div>} />
            <Route path="/cms/categories/new" element={<CategoryEditor />} />
            <Route path="/cms/categories/:id" element={<CategoryEditor />} />
          </Routes>
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["cms.article.view", "cms.taxonomy.manage"];
const SAVE = () => i18n.t("common.save");

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("CategoryEditor", () => {
  it("create: POST with name + sort_order, then back to the list", async () => {
    signIn(MANAGER);
    let postBody: Record<string, unknown> | undefined;
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/categories`, async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "c" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/new");

    // name is the first textbox (its required label carries a "*" so we can't
    // match it by accessible name).
    await user.type((await screen.findAllByRole("textbox"))[0], "Thể thao");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect(postBody).toMatchObject({ name: "Thể thao", sort_order: 0 }),
    );
    expect(await screen.findByText("CATEGORY LIST")).toBeInTheDocument();
  });

  it("edit: prefilled from the tree, PATCH carries the optimistic-lock updated_at", async () => {
    signIn(MANAGER);
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      ...baseHandlers(),
      http.patch(`${API}/cms/categories/a`, async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "a" });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/a");

    const name = await screen.findByDisplayValue("Tin tức");
    await user.clear(name);
    await user.type(name, "Tin mới");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() =>
      expect(patchBody).toMatchObject({ name: "Tin mới", updated_at: "u-a" }),
    );
  });

  it("create: no permalink row — the server derives the slug from the name", async () => {
    signIn(MANAGER);
    server.use(...baseHandlers());
    renderEditor("/cms/categories/new");

    await screen.findAllByRole("textbox");
    expect(
      screen.queryByText(i18n.t("cms.categories.editor.permalink")),
    ).not.toBeInTheDocument();
  });

  it("edit: the permalink is locked and an unchanged slug is not sent", async () => {
    signIn(MANAGER);
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      ...baseHandlers(),
      http.patch(`${API}/cms/categories/a`, async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "a" });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/a");

    expect(await screen.findByText("tin-tuc")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("tin-tuc")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() => expect(patchBody).toBeDefined());
    // Re-sending the current slug would re-run the rename path for an address
    // people already hold.
    expect(patchBody).not.toHaveProperty("slug");
  });

  it("translation: the English tab is written before the record itself", async () => {
    signIn(MANAGER);
    const calls: string[] = [];
    let putBody: Record<string, unknown> | undefined;
    server.use(
      // First wins in MSW, so this one overrides the disabled flag in
      // baseHandlers().
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      ...baseHandlers(),
      http.get(`${API}/translations/cms_category/a`, () =>
        HttpResponse.json(trView()),
      ),
      http.put(`${API}/translations/cms_category/a/en`, async ({ request }) => {
        calls.push("translation");
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(trView({ name: "News" }));
      }),
      http.patch(`${API}/cms/categories/a`, () => {
        calls.push("record");
        return HttpResponse.json({ id: "a" });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/a");

    await user.click(await screen.findByRole("tab", { name: /English/ }));
    // The panel is labelled in the language being written, so this box is
    // "Name" and not "Tên".
    await user.type(screen.getByLabelText("Name"), "News");
    // The Vietnamese form stays mounted behind it: switching language must not
    // throw away what is in it.
    expect(screen.getByDisplayValue("Tin tức")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SAVE() }));

    await waitFor(() => expect(calls).toEqual(["translation", "record"]));
    expect(putBody).toMatchObject({ values: { name: "News" } });
  });

  it("validation: empty name blocks submit", async () => {
    signIn(MANAGER);
    let posted = false;
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/categories`, () => {
        posted = true;
        return HttpResponse.json({ id: "c" }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/new");

    await screen.findAllByRole("textbox");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    expect(
      await screen.findByText(i18n.t("errors.validation.required")),
    ).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("slug conflict: 422 surfaces inline on the slug field", async () => {
    signIn(MANAGER);
    server.use(
      ...baseHandlers(),
      http.post(`${API}/cms/categories`, () =>
        HttpResponse.json(
          { error: { code: 422, message: "slug_already_exists" } },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor("/cms/categories/new");

    await user.type((await screen.findAllByRole("textbox"))[0], "Dup");
    await user.click(screen.getByRole("button", { name: SAVE() }));

    expect(
      (await screen.findAllByText(i18n.t("errors.slug_already_exists"))).length,
    ).toBeGreaterThan(0);
  });
});
