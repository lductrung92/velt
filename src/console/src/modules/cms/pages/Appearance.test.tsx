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
    http.get(`${API}/public/settings`, () =>
      HttpResponse.json({
        "translation.enabled": true,
        "translation.locales": "en",
      }),
    ),
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
        // The real endpoint answers with the stored rows, in the order they
        // were sent; a block that arrived without an id has one now.
        return HttpResponse.json({
          slot: String(params.slot),
          blocks: body.blocks.map((b, i) => ({
            ...(b as Record<string, unknown>),
            id: ((b as { id?: string }).id ?? `saved-${i}`) as string,
          })),
        });
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

/** Settings open from the row's pencil now, never from the row itself. */
async function editBlock(
  user: ReturnType<typeof userEvent.setup>,
  within_: HTMLElement,
  label: string,
) {
  await user.click(
    within(within_).getByRole("button", {
      name: i18n.t("cms.appearance.edit", { label }),
    }),
  );
}

/** The card's title strip. Its empty state answers to the same name, so the
 *  first match is the one that is always there. */
async function pickRegion(
  user: ReturnType<typeof userEvent.setup>,
  group: string,
  slot: string,
) {
  const card = screen.getByTestId(`cms-slot-${group}/${slot}`);
  await user.click(
    within(card).getAllByRole("button", {
      name: i18n.t("cms.appearance.ui.select_region", {
        slot: i18n.t(`cms.appearance.slot.${slot}`),
      }),
    })[0],
  );
}

/** The scope picker is the shared react-select; its labels carry an indent. */
async function pickGroup(
  user: ReturnType<typeof userEvent.setup>,
  group: string,
) {
  await user.click(
    screen.getByRole("combobox", { name: t("cms.appearance.groups_title") }),
  );
  await user.click(
    await screen.findByRole("option", {
      name: new RegExp(t(`cms.appearance.group.${group}`)),
    }),
  );
}

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

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a child group inheriting, and overriding on request", async () => {
    const puts: { at: string; body: unknown }[] = [];
    stubApi({ puts });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("cms-slot-common/header");

    await pickGroup(user, "blog_detail");

    // blog_detail fills neither header nor footer, so both cards are folded to
    // their title row: nine groups each showing a read-only copy of the same
    // two lists was most of the board repeating itself.
    const shut = await screen.findByTestId("cms-slot-blog_detail/footer");
    expect(
      within(shut).getByText(t("cms.appearance.ui.chrome_inherited")),
    ).toBeInTheDocument();
    expect(within(shut).queryByText("Menu: Footer")).not.toBeInTheDocument();

    // It does offer the two places only an article page has.
    expect(
      screen.getByTestId("cms-slot-blog_detail/after_article"),
    ).toBeInTheDocument();

    // Turning the switch on IS overriding: the parent's list comes down as the
    // starting point, as new rows — the ids belong to the parent and must not
    // be moved.
    await user.click(
      screen.getByRole("switch", {
        name: t("cms.appearance.ui.chrome_toggle", {
          slot: t("cms.appearance.slot.footer"),
        }),
      }),
    );
    const footer = await screen.findByTestId("cms-slot-blog_detail/footer");
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
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();
    await screen.findByTestId("cms-slot-common/header");

    // The header is chrome, so the library starts on menus and says why.
    expect(
      screen.getByRole("tab", { name: t("cms.appearance.palette.widgets") }),
    ).toBeDisabled();
    const menus = screen.getAllByTestId("cms-palette-item");
    expect(menus).toHaveLength(2);
    expect(menus.at(-1)).toHaveTextContent("Footer");

    // A rail takes both, and the block list is the region one: the taxonomy
    // grid is not offered here.
    await pickGroup(user, "blog_detail");
    await pickRegion(user, "blog_detail", "sidebar_left");
    const items = await screen.findAllByTestId("cms-palette-item");
    expect(items).toHaveLength(4);
    expect(
      screen.queryByText(t("cms.pages.widget.categories_showcase.name")),
    ).not.toBeInTheDocument();
  });

  it("enables Save only after a block's visibility changes", async () => {
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();

    const header = await screen.findByTestId("cms-slot-common/header");
    expect(
      screen.getByRole("button", { name: t("common.save") }),
    ).toBeDisabled();

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
    ).toBeEnabled();
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

  it("removes a block and disables Save once Reset restores the board", async () => {
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
    expect(
      screen.getByRole("button", { name: t("common.save") }),
    ).toBeDisabled();
  });

  it("gives a menu block no settings to open", async () => {
    stubApi({ puts: [] });
    renderPage();

    // Which menu it is IS the block; there is nothing else to set, so the row
    // offers no pencil. A widget in the same slot still does.
    const header = await screen.findByTestId("cms-slot-common/header");
    expect(
      within(header).queryByRole("button", {
        name: t("cms.appearance.edit", { label: "Menu: Header" }),
      }),
    ).not.toBeInTheDocument();
    expect(
      within(header).getByRole("button", {
        name: t("cms.appearance.edit", {
          label: t("cms.pages.widget.cta_banner.name"),
        }),
      }),
    ).toBeInTheDocument();
  });

  it("adds a block without dragging to the chosen region and saves only that region", async () => {
    const user = userEvent.setup();
    const puts: { at: string; body: unknown }[] = [];
    stubApi({ puts });
    renderPage();
    await screen.findByTestId("cms-slot-common/footer");
    // The chrome takes menus only, so a block goes to a rail.
    await pickGroup(user, "blog_detail");
    // Clicking the region's own card is how the target is chosen now; the
    // palette states it rather than offering a second way to set it.
    const at = "cms-slot-blog_detail/sidebar_left";
    await pickRegion(user, "blog_detail", "sidebar_left");
    const label = t("cms.pages.widget.rich_text.name");
    await user.click(
      screen.getByRole("button", {
        name: t("cms.appearance.ui.add", { label }),
      }),
    );
    // Adding does NOT open settings: three blocks in a row must be possible.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The row names itself in text now; only its pencil and bin are buttons.
    expect(within(screen.getByTestId(at)).getByText(label)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: t("common.save") }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].at).toBe("blog_detail/sidebar_left");
    expect(puts[0].body).toMatchObject({
      blocks: [{ kind: "widget", widget_type: "rich_text" }],
    });
  });

  it("changing page group clears settings for a block outside the visible board", async () => {
    const user = userEvent.setup();
    stubApi({ puts: [] });
    renderPage();
    const header = await screen.findByTestId("cms-slot-common/header");
    await editBlock(user, header, t("cms.pages.widget.cta_banner.name"));
    expect(
      within(screen.getByTestId("block-form")).getByLabelText(
        t("cms.pages.widget.cta_banner.heading"),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t("common.close") }));
    await pickGroup(user, "blog_detail");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(t("cms.pages.widget.cta_banner.heading")),
    ).toBeNull();
  });

  it("discards on Escape and only applies on confirm", async () => {
    // The dialog edits a copy. Before, typing reached the page draft directly
    // and Escape kept it — a form with a cancel that cancelled nothing.
    const user = userEvent.setup();
    const puts: { at: string; body: unknown }[] = [];
    stubApi({ puts });
    renderPage();
    const header = await screen.findByTestId("cms-slot-common/header");
    const open = async () =>
      editBlock(user, header, t("cms.pages.widget.cta_banner.name"));

    await open();
    await user.type(
      within(screen.getByTestId("block-form")).getByLabelText(
        t("cms.pages.widget.cta_banner.heading"),
      ),
      "Bắt đầu",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The save bar is always on screen; with nothing applied it stays disabled.
    expect(
      screen.getByRole("button", { name: t("common.save") }),
    ).toBeDisabled();

    // Again, this time confirming.
    await open();
    const dialog = screen.getByRole("dialog", {
      name: t("cms.appearance.settings"),
    });
    await user.type(
      within(within(dialog).getByTestId("block-form")).getByLabelText(
        t("cms.pages.widget.cta_banner.heading"),
      ),
      "Bắt đầu",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.done") }),
    );
    // Applied to the draft, not to the server: that is the page's Save.
    expect(
      screen.getByRole("button", { name: t("common.save") }),
    ).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it("stores a new block's translation once the save hands out its id", async () => {
    const user = userEvent.setup();
    const puts: { at: string; body: unknown }[] = [];
    const translations: { url: string; body: unknown }[] = [];
    stubApi({ puts });
    server.use(
      http.put(
        `${API}/translations/region_block/:id/:locale`,
        async ({ params, request }) => {
          translations.push({
            url: `${params.id}/${params.locale}`,
            body: await request.json(),
          });
          return HttpResponse.json({});
        },
      ),
    );
    renderPage();
    await screen.findByTestId("cms-slot-common/footer");
    await pickGroup(user, "blog_detail");
    await pickRegion(user, "blog_detail", "sidebar_left");

    const label = t("cms.pages.widget.cta_banner.name");
    await user.click(
      screen.getByRole("button", {
        name: t("cms.appearance.ui.add", { label }),
      }),
    );
    await editBlock(
      user,
      screen.getByTestId("cms-slot-blog_detail/sidebar_left"),
      label,
    );
    const dialog = screen.getByRole("dialog");
    // The Vietnamese goes in the form; the box underneath only appears once
    // there is something to translate.
    await user.type(
      within(within(dialog).getByTestId("block-form")).getByLabelText(
        t("cms.pages.widget.cta_banner.heading"),
      ),
      "Bắt đầu ngay",
    );
    await user.type(
      within(
        await within(dialog).findByTestId("block-translations"),
      ).getByLabelText(t("cms.pages.widget.cta_banner.heading")),
      "Get started",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.done") }),
    );

    expect(translations).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: t("common.save") }));
    await waitFor(() => expect(translations).toHaveLength(1));
    expect(translations[0].url).toBe("saved-0/en");
    expect(translations[0].body).toEqual({
      values: { config: { heading: "Get started" } },
    });
  });
});
