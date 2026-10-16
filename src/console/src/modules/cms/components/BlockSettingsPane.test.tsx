import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { BlockSettingsPane } from "./BlockSettingsPane";

import type { BlockDraft } from "../utils/regionBlocks";

const API = "http://localhost/api";
const BLOCK = "11111111-2222-3333-4444-555555555555";
const t = (k: string) => i18n.t(k);
const field = (key: string) => t(`cms.pages.widget.cta_banner.${key}`);

// The category pickers inside the widget forms read the taxonomies; stub them
// so this file is about the translation section and nothing else.
vi.mock("../hooks/useCmsCategories", () => ({
  useCategories: () => ({ data: [] }),
}));
vi.mock("@/modules/products/hooks/useProductCategories", () => ({
  useProductCategories: () => ({ data: { items: [] } }),
}));

function block(over: Partial<BlockDraft> = {}): BlockDraft {
  return {
    key: "k1",
    id: BLOCK,
    kind: "widget",
    widget_type: "cta_banner",
    menu_id: null,
    config: {
      heading: "Bắt đầu ngay",
      align: "center",
      buttons: [{ label: "Dùng thử", href: "/dang-ky", style: "primary" }],
    },
    is_visible: true,
    ...over,
  };
}

function trView() {
  return {
    entity: "region_block",
    entity_id: BLOCK,
    base_locale: "vi",
    locales: ["en"],
    translatable_fields: ["config"],
    translations: {},
    requires_republish: false,
  };
}

function signIn() {
  useAuthStore.getState().setSession(
    {
      id: "u1",
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

function renderPane(b: BlockDraft | null) {
  const onTranslations = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <BlockSettingsPane
          block={b}
          menus={[]}
          onConfigChange={vi.fn()}
          onTranslations={onTranslations}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return onTranslations;
}

beforeEach(() => {
  signIn();
  server.use(
    http.get(`${API}/public/settings`, () =>
      HttpResponse.json({
        "translation.enabled": true,
        "translation.locales": "en",
      }),
    ),
    http.get(`${API}/translations/region_block/${BLOCK}`, () =>
      HttpResponse.json(trView()),
    ),
  );
});
afterEach(() => useAuthStore.getState().clear());

describe("BlockSettingsPane translations", () => {
  it("offers a box per piece of prose, and nothing else", async () => {
    renderPane(block());
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(t("cms.appearance.translate_heading"));

    // Heading, button label and button href, each LABELLED the way the form
    // above labels it — a label, not a placeholder, so the name survives being
    // typed into. The alignment and the button's style are one choice for
    // every reader, so they are not here.
    const panel = within(dialog).getByTestId("block-translations");
    expect(within(panel).getByLabelText(field("heading"))).toBeInTheDocument();
    expect(
      within(panel).getByLabelText(field("button_label")),
    ).toBeInTheDocument();
    expect(
      within(panel).getByLabelText(field("button_href")),
    ).toBeInTheDocument();
    // `sub` is empty on this block, and its box is offered all the same: the
    // form is the same shape every time it opens.
    expect(within(panel).getByLabelText(field("sub"))).toBeInTheDocument();
    expect(
      within(panel).queryByLabelText(field("align")),
    ).not.toBeInTheDocument();
    // The base form is still above it, untouched.
    expect(within(dialog).getByLabelText(field("align"))).toBeInTheDocument();
  });

  it("hands the typed text to the page in the shape the block has", async () => {
    const user = userEvent.setup();
    const onTranslations = renderPane(block());
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(
        await within(dialog).findByTestId("block-translations"),
      ).getByLabelText(field("heading")),
      "Get started",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.done") }),
    );

    await waitFor(() => expect(onTranslations).toHaveBeenCalled());
    expect(onTranslations.mock.calls[0][0]).toEqual({
      en: { config: { heading: "Get started" } },
    });
  });

  it("takes a translation for a block that has not been saved yet", async () => {
    const user = userEvent.setup();
    const onTranslations = renderPane(block({ id: null }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(
        await within(dialog).findByTestId("block-translations"),
      ).getByLabelText(field("button_label")),
      "Try it",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t("common.done") }),
    );

    await waitFor(() => expect(onTranslations).toHaveBeenCalled());
    expect(onTranslations.mock.calls[0][0]).toEqual({
      en: { config: { buttons: [{ label: "Try it" }] } },
    });
  });
});
