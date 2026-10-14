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

import Appearance from "./Appearance";

import type { RegionGroupDetail } from "../services/regions.service";

const API = "http://localhost/api";

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

function menuSlot(id: string, name: string, location: string) {
  return {
    id,
    name,
    location,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const REGIONS_FIXTURE: RegionGroupDetail[] = [
  {
    group: "common",
    parent: null,
    slots: [
      {
        slot: "header",
        blocks: [
          {
            id: "blk-menu",
            kind: "menu",
            widget_type: null,
            menu_id: "menu-header",
            config: {},
            is_visible: true,
          },
          {
            id: "blk-cta",
            kind: "widget",
            widget_type: "cta_banner",
            menu_id: null,
            config: { align: "center" },
            is_visible: true,
          },
        ],
      },
      {
        slot: "footer",
        blocks: [
          {
            id: "blk-foot",
            kind: "menu",
            widget_type: null,
            menu_id: "menu-footer",
            config: {},
            is_visible: true,
          },
        ],
      },
    ],
  },
  {
    group: "blog",
    parent: "common",
    slots: [
      { slot: "header", blocks: [] },
      { slot: "footer", blocks: [] },
    ],
  },
  {
    group: "blog_detail",
    parent: "blog",
    slots: [
      { slot: "header", blocks: [] },
      { slot: "footer", blocks: [] },
      { slot: "sidebar_left", blocks: [] },
      { slot: "after_article", blocks: [] },
    ],
  },
];

/** Records every PUT the screen makes, so a test can assert what was NOT sent. */
function stubApi(opts: { puts: { at: string; body: unknown }[] }) {
  server.use(
    http.get(`${API}/cms/regions`, () => HttpResponse.json(REGIONS_FIXTURE)),
    http.get(`${API}/cms/menus`, () =>
      HttpResponse.json([
        menuSlot("menu-header", "Header", "header"),
        menuSlot("menu-footer", "Footer", "footer"),
      ]),
    ),
    http.put(
      `${API}/cms/regions/:group/:slot/blocks`,
      async ({ params, request }) => {
        const at = `${params.group}/${params.slot}`;
        const body = (await request.json()) as { blocks: unknown[] };
        opts.puts.push({ at, body });
        return HttpResponse.json({ slot: String(params.slot), blocks: [] });
      },
    ),
  );
}

function signIn() {
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
  useAuthStore.getState().setAuthz(["admin"], ["cms.menu.manage"]);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/cms/giao-dien"]}>
          <Appearance />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

beforeEach(() => signIn());
afterEach(() => useAuthStore.getState().clear());

describe("Appearance", () => {
  it("opens on Chung and shows only the slots that group can fill", async () => {
    stubApi({ puts: [] });
    renderPage();

    const header = await screen.findByTestId("cms-slot-common/header");
    expect(within(header).getByText("Menu: Header")).toBeInTheDocument();
    expect(within(header).getByText(t("cms.appearance.count", { n: 2 })));
    expect(screen.getByTestId("cms-slot-common/footer")).toBeInTheDocument();

    // Every page has a header and a footer; an article's left column is not a
    // place that exists on every page, so Chung must not offer it.
    expect(
      screen.queryByTestId("cms-slot-common/sidebar_left"),
    ).not.toBeInTheDocument();

    // Nothing picked yet, so the right column is a hint rather than a form.
    expect(
      screen.getByText(t("cms.appearance.settings_hint")),
    ).toBeInTheDocument();
  });

  it("shows a child group inheriting, and overriding on request", async () => {
    const puts: { at: string; body: unknown }[] = [];
    stubApi({ puts });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-slot-common/header");

    await user.click(
      screen.getByRole("treeitem", {
        name: new RegExp(t("cms.appearance.group.blog_detail")),
      }),
    );

    // blog_detail fills neither header nor footer, so both read as inherited
    // and are not editable until somebody says so.
    const footer = await screen.findByTestId("cms-slot-blog_detail/footer");
    expect(
      within(footer).getByText(
        t("cms.appearance.inherited_from", {
          group: t("cms.appearance.group.common"),
        }),
      ),
    ).toBeInTheDocument();
    expect(within(footer).getByText("Menu: Footer")).toBeInTheDocument();

    // It also offers the two places only an article page has.
    expect(
      screen.getByTestId("cms-slot-blog_detail/sidebar_left"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("cms-slot-blog_detail/after_article"),
    ).toBeInTheDocument();

    // Overriding copies the parent's list down as the starting point, as new
    // rows — the ids belong to the parent and must not be moved.
    await user.click(
      within(footer).getByRole("button", {
        name: t("cms.appearance.override"),
      }),
    );
    expect(
      within(footer).queryByText(
        t("cms.appearance.inherited_from", {
          group: t("cms.appearance.group.common"),
        }),
      ),
    ).not.toBeInTheDocument();
    expect(within(footer).getByText("Menu: Footer")).toBeInTheDocument();

    // And they are NEW rows: carrying the parent's ids down would make this
    // save move Chung's rows into blog_detail instead of copying them.
    await user.click(screen.getByRole("button", { name: t("common.save") }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].at).toBe("blog_detail/footer");
    expect(
      (puts[0].body as { blocks: { id?: string }[] }).blocks.map((b) => b.id),
    ).toEqual([undefined]);
  });

  it("offers every widget type and every menu in the palette", async () => {
    stubApi({ puts: [] });
    renderPage();

    const items = await screen.findAllByTestId("cms-palette-item");
    // Five widget types + two menus.
    expect(items).toHaveLength(7);
    expect(items.at(-1)).toHaveTextContent("Footer");
  });

  it("toggles a block's visibility and only then shows the save bar", async () => {
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();

    const header = await screen.findByTestId("cms-slot-common/header");
    expect(screen.queryByRole("button", { name: t("common.save") })).toBeNull();

    const eye = within(header).getByRole("button", {
      name: t("cms.appearance.hide", { label: "Menu: Header" }),
    });
    expect(eye).toHaveAttribute("aria-pressed", "true");
    await user.click(eye);

    const shown = within(header).getByRole("button", {
      name: t("cms.appearance.show", { label: "Menu: Header" }),
    });
    expect(shown).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: t("common.save") }),
    ).toBeInTheDocument();
  });

  it("saves only the slots that changed, keeping ids the blocks already had", async () => {
    const user = userEvent.setup();
    const puts: { at: string; body: unknown }[] = [];
    stubApi({ puts });
    renderPage();

    const header = await screen.findByTestId("cms-slot-common/header");
    await user.click(
      within(header).getByRole("button", {
        name: t("cms.appearance.hide", { label: "Menu: Header" }),
      }),
    );
    await user.click(screen.getByRole("button", { name: t("common.save") }));

    await waitFor(() => expect(puts).toHaveLength(1));
    // sidebar and footer were untouched, so they are never PUT.
    expect(puts.map((p) => p.at)).toEqual(["common/header"]);
    expect(puts[0].body).toEqual({
      blocks: [
        {
          id: "blk-menu",
          kind: "menu",
          widget_type: null,
          menu_id: "menu-header",
          config: {},
          is_visible: false,
        },
        {
          id: "blk-cta",
          kind: "widget",
          widget_type: "cta_banner",
          menu_id: null,
          config: { align: "center" },
          is_visible: true,
        },
      ],
    });
  });

  it("removes a block and drops the save bar once the board matches again", async () => {
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();

    const footer = await screen.findByTestId("cms-slot-common/footer");
    await user.click(
      within(footer).getByRole("button", {
        name: t("cms.appearance.remove", { label: "Menu: Footer" }),
      }),
    );
    expect(within(footer).queryByText("Menu: Footer")).toBeNull();

    await user.click(screen.getByRole("button", { name: t("common.reset") }));
    expect(within(footer).getByText("Menu: Footer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("common.save") })).toBeNull();
  });

  it("picks a menu block and lets its menu be swapped", async () => {
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();

    const header = await screen.findByTestId("cms-slot-common/header");
    await user.click(within(header).getByText("Menu: Header"));

    expect(
      screen.getByText(t("cms.appearance.which_menu")),
    ).toBeInTheDocument();
    expect(screen.queryByText(t("cms.appearance.settings_hint"))).toBeNull();
  });
});
