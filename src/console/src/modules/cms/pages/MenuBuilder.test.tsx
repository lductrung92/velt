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
    label_display: label,
    description: null,
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
  it("empty list shows one onboarding state and opens the create dialog", async () => {
    signIn(MANAGE);
    server.use(http.get(`${API}/cms/menus`, () => HttpResponse.json([])));
    const user = userEvent.setup();
    renderPage();
    const create = await screen.findByRole("button", {
      name: t("cms.menus.onboarding.create"),
    });
    expect(
      screen.queryByText(t("cms.menus.placeholder_title")),
    ).not.toBeInTheDocument();
    await user.click(create);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("empty list does not offer creation without manage permission", async () => {
    signIn([]);
    server.use(http.get(`${API}/cms/menus`, () => HttpResponse.json([])));
    renderPage();
    await screen.findByRole("heading", { name: t("cms.menus.empty_title") });
    expect(
      screen.queryByRole("button", { name: t("cms.menus.onboarding.create") }),
    ).not.toBeInTheDocument();
  });

  it("opens the first menu by itself, without a click", async () => {
    signIn(MANAGE);
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([
          slot("m1", "Header", "header"),
          slot("m2", "Footer", "footer"),
        ]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i1", "Home")],
        }),
      ),
    );
    renderPage();

    // The first slot's items, with nothing clicked.
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

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

  it("lets a second menu take an occupied location", async () => {
    // A location used to be UNIQUE and a second menu there was a 422. Several
    // may share one now, and which of them the site renders is a separate
    // decision — the dialog must simply not stand in the way.
    signIn(MANAGE);
    let postBody: { location?: string } | undefined;
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({ ...slot("m1", "Header", "header"), items: [] }),
      ),
      http.post(`${API}/cms/menus`, async ({ request }) => {
        postBody = (await request.json()) as { location?: string };
        return HttpResponse.json(slot("m2", "Header B", "header"));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Header");

    await user.click(
      screen.getByRole("button", { name: t("cms.menus.create") }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Header B");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", {
        name: t("cms.menus.field.location_opt.header"),
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.save") }),
    );

    await waitFor(() => expect(postBody).toBeDefined());
    expect(postBody?.location).toBe("header");
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
    // The second textbox is the optional description — it must reach the PUT.
    await user.type(screen.getAllByRole("textbox")[1], "Trang gioi thieu");
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
        description: "Trang gioi thieu",
        link_type: "internal",
        target_id: null,
        url: "/about",
        open_new_tab: false,
        children: [],
      },
    ]);
  });

  it("writes a translation typed before the item had an id", async () => {
    // The boxes are offered while the item is still local, so what is typed
    // has nowhere to go until the PUT hands out ids. Losing it silently is
    // what makes a person retype the same label twice.
    signIn(MANAGE);
    const written: Array<{ url: string; body: unknown }> = [];
    server.use(
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({ ...slot("m1", "Header", "header"), items: [] }),
      ),
      http.put(`${API}/cms/menus/m1/items`, () =>
        HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i9", "Gioi thieu")],
        }),
      ),
      http.put(`${API}/translations/menu_item/:id/:locale`, async (ctx) => {
        written.push({ url: ctx.request.url, body: await ctx.request.json() });
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: t("common.add_new") }),
    );
    await user.type(screen.getAllByRole("textbox")[0], "Gioi thieu");
    await user.type(
      screen.getByPlaceholderText(t("cms.menus.item.url_internal_ph")),
      "/about",
    );
    // The English box only exists because the dialog no longer waits for an id.
    // It is found by its LABEL: the field's name moved out of the placeholder,
    // which now shows the Vietnamese the box falls back to.
    const english = await screen.findByLabelText(t("cms.menus.item.label"));
    await user.type(english, "About");
    await user.click(screen.getByRole("button", { name: t("common.save") }));

    await user.click(
      await screen.findByRole("button", { name: t("cms.menus.save") }),
    );

    // Two round trips away (the item PUT has to answer first), so the default
    // one-second budget is not enough here.
    await waitFor(() => expect(written).toHaveLength(1), { timeout: 3000 });
    expect(written[0].url).toContain("/translations/menu_item/i9/en");
    expect(written[0].body).toMatchObject({ values: { label: "About" } });
  });

  it("save: an item that already exists keeps its id", async () => {
    // The backend keeps a row whose id comes back and deletes the rest. Drop
    // the id here and every save would recreate the item under a new one,
    // orphaning its translated label — silently, and only in the second
    // language, which is the worst place to find out.
    signIn(MANAGE);
    let putBody: { items: { id?: string; label: string }[] } | undefined;
    server.use(
      http.get(`${API}/cms/menus`, () =>
        HttpResponse.json([slot("m1", "Header", "header")]),
      ),
      http.get(`${API}/cms/menus/m1`, () =>
        HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i7", "About")],
        }),
      ),
      http.put(`${API}/cms/menus/m1/items`, async ({ request }) => {
        putBody = (await request.json()) as typeof putBody;
        return HttpResponse.json({
          ...slot("m1", "Header", "header"),
          items: [itemNode("i7", "About")],
        });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Header"));
    await user.click(await screen.findByText("About"));
    const label = screen.getAllByRole("textbox")[0];
    await user.clear(label);
    await user.type(label, "Giới thiệu");
    await user.type(
      screen.getByPlaceholderText(t("cms.menus.item.url_internal_ph")),
      "{Enter}",
    );
    await user.click(
      await screen.findByRole("button", { name: t("cms.menus.save") }),
    );

    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody?.items[0].id).toBe("i7");
    expect(putBody?.items[0].label).toBe("Giới thiệu");
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
