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
