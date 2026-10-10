import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import MenuBuilder from "./MenuBuilder";

const API = "http://localhost/api";

// Radix DropdownMenu/Switch need these in jsdom (overflow menus + the toggle).
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function slot(id: string, name: string, location: string) {
  return {
    id,
    name,
    location,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function itemNode(id: string, label: string) {
  return {
    id,
    label,
    link_type: "internal",
    target_id: null,
    url: "/",
    open_new_tab: false,
    sort_order: 0,
    children: [],
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/cms/menus"]}>
          <MenuBuilder />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGE = ["cms.menu.manage"];
const t = (k: string) => i18n.t(k);

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("MenuBuilder", () => {
  it("loads slots and shows a selected menu's items", async () => {
    signIn(MANAGE);
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i1", "Home")],
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Header"));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    // link_type badge rendered.
    expect(
      screen.getByText(t("cms.menus.link_type.internal")),
    ).toBeInTheDocument();
  });

  it("create menu: Create → dialog → POST { name, location }", async () => {
    signIn(MANAGE);
    let postBody: unknown;
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.post(`${API}/cms/menus`, async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json(slot("m2", "Footer", "footer"), {
          status: 201,
        });
      }),
      // The builder auto-selects the freshly created slot → loads its detail.
      http.get(`${API}/cms/menus/m2`, () =>
        HttpResponse.json({ ...slot("m2", "Footer", "footer"), items: [] }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Header");

    await user.click(
      screen.getByRole("button", { name: t("cms.menus.create") }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Footer");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", {
        name: t("cms.menus.field.location_opt.footer"),
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.save") }),
    );

    await waitFor(() =>
      expect(postBody).toEqual({ name: "Footer", location: "footer" }),
    );
  });

  it("location conflict (409) shows inline on the location field", async () => {
    signIn(MANAGE);
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.post(`${API}/cms/menus`, () =>
        HttpResponse.json(
          { error: { code: 409, message: "conflict" } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Header");

    await user.click(
      screen.getByRole("button", { name: t("cms.menus.create") }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Dup");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", {
        name: t("cms.menus.field.location_opt.header"),
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.save") }),
    );

    expect(
      await within(dialog).findByText(t("errors.conflict")),
    ).toBeInTheDocument();
  });

  it("add an item then save replaces the whole tree (PUT items)", async () => {
    signIn(MANAGE);
    let putBody: { items: unknown[] } | undefined;
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({ ...slot("m1", "Header", "header"), items: [] }),
      ),
      http.put(`${API}/cms/menus/m1/items`, async ({ request }) => {
        putBody = (await request.json()) as { items: unknown[] };
        return HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i9", "About")],
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Header"));
    // Empty menu → open the item form.
    await user.click(
      await screen.findByRole("button", { name: t("common.add_new") }),
    );
    await user.type(
      screen.getByPlaceholderText(t("cms.menus.item.url_internal_ph")),
      "/about",
    );
    const labelInput = screen.getAllByRole("textbox")[0];
    await user.type(labelInput, "About");
    // Submit the item form (Enter) → applied to the local draft tree.
    await user.type(
      screen.getByPlaceholderText(t("cms.menus.item.url_internal_ph")),
      "{Enter}",
    );

    expect(await screen.findByText("About")).toBeInTheDocument();

    // Dirty → save the whole tree.
    await user.click(
      await screen.findByRole("button", { name: t("cms.menus.save") }),
    );
    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody?.items).toEqual([
      {
        label: "About",
        link_type: "internal",
        target_id: null,
        url: "/about",
        open_new_tab: false,
        children: [],
      },
    ]);
  });

  it("delete slot: overflow → confirm → DELETE", async () => {
    signIn(MANAGE);
    let deleted = false;
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.delete(`${API}/cms/menus/m1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Header");

    await user.click(screen.getByRole("button", { name: t("common.actions") }));
    await user.click(
      await screen.findByRole("menuitem", { name: t("common.delete") }),
    );
    const confirm = await screen.findByRole("alertdialog");
    await user.click(
      within(confirm).getByRole("button", { name: t("common.delete") }),
    );

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("detail 404: shows a not-found alert", async () => {
    signIn(MANAGE);
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json(
          { error: { code: 404, message: "not_found" } },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Header"));
    expect(await screen.findByText(t("errors.not_found"))).toBeInTheDocument();
  });

  it("without cms.menu.manage: no create button or slot actions", async () => {
    signIn(["cms.article.view"]);
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
    );
    renderPage();
    await screen.findByText("Header");

    expect(
      screen.queryByRole("button", { name: t("cms.menus.create") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("common.actions") }),
    ).not.toBeInTheDocument();
  });
});
