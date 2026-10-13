import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { SectionTranslateDialog } from "./SectionTranslateDialog";

const API = "http://localhost/api";
const SECTION = "11111111-2222-3333-4444-555555555555";

// A real section config: nested strings, a list, and values that are not text.
const CONFIG = {
  title: "Câu hỏi thường gặp",
  limit: 4,
  seo: { title: "Hỏi đáp", noindex: false },
  items: [
    { question: "Dành cho ai?", answer_html: "Cho mọi người." },
    { question: "Dùng thử được không?", answer_html: "Được." },
  ],
};

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
  useAuthStore.getState().setAuthz(["admin"], ["cms.landing.manage"]);
}

function trView(values?: Record<string, unknown>) {
  return {
    entity: "landing_section",
    entity_id: SECTION,
    base_locale: "vi",
    locales: ["en"],
    translatable_fields: ["config"],
    translations: values ? { en: { values, updated_at: "u" } } : {},
    requires_republish: false,
  };
}

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <SectionTranslateDialog
          open
          onOpenChange={() => {}}
          sectionId={SECTION}
          sectionLabel="FAQ"
          config={CONFIG}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
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
  );
});
afterEach(() => useAuthStore.getState().clear());

describe("SectionTranslateDialog", () => {
  it("offers one box per piece of text, and nothing else", async () => {
    server.use(
      http.get(`${API}/translations/landing_section/${SECTION}`, () =>
        HttpResponse.json(trView()),
      ),
    );
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    // Six strings: title, seo.title, and two per item. The number 4 and the
    // boolean are the same page in every language and must not appear.
    await waitFor(() =>
      expect(within(dialog).getAllByRole("textbox")).toHaveLength(6),
    );
    expect(within(dialog).getByText("items › 0 › question")).toBeInTheDocument();
    expect(within(dialog).getByText("seo › title")).toBeInTheDocument();
    expect(within(dialog).queryByText("limit")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("seo › noindex")).not.toBeInTheDocument();

    // The published text is the placeholder: an empty box keeps it.
    expect(
      within(dialog).getByPlaceholderText("Câu hỏi thường gặp"),
    ).toHaveValue("");
  });

  it("saves the typed text in the shape the section has", async () => {
    let body: { values?: { config?: unknown } } | undefined;
    server.use(
      http.get(`${API}/translations/landing_section/${SECTION}`, () =>
        HttpResponse.json(trView()),
      ),
      http.put(
        `${API}/translations/landing_section/${SECTION}/en`,
        async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(trView());
        },
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("textbox")).toHaveLength(6),
    );
    await user.type(
      within(dialog).getByPlaceholderText("Câu hỏi thường gặp"),
      "FAQ",
    );
    await user.type(
      within(dialog).getByPlaceholderText("Dùng thử được không?"),
      "Can I try it?",
    );
    await user.click(
      within(dialog).getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(body).toBeDefined());
    // Only what was typed travels, nested exactly as the config nests it — the
    // server merges field by field onto the published copy.
    // The untouched first item travels as null (a hole in the array, which is
    // what JSON makes of it); the server's merge skips anything that is not
    // text, so that item keeps every word it was published with.
    expect(body?.values?.config).toEqual({
      title: "FAQ",
      items: [null, { question: "Can I try it?" }],
    });
  });
});
