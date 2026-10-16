import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { TagFormDialog } from "./TagFormDialog";

const API = "http://localhost/api";

function tag() {
  return {
    id: "t1",
    name: "Golang",
    slug: "golang",
    usage_count: 2,
    created_at: "2026-01-01T00:00:00Z",
  };
}

// A tag declares exactly one translatable field, which is what the dialog is
// built around.
function trView(values?: Record<string, unknown>) {
  return {
    entity: "tag",
    entity_id: "t1",
    base_locale: "vi",
    locales: ["en"],
    translatable_fields: ["name"],
    translations: values ? { en: { values, updated_at: "u" } } : {},
    requires_republish: false,
  };
}

function settingsHandler() {
  return http.get(`${API}/cms/settings`, () =>
    HttpResponse.json({
      cms: [{ key: "cms.article.allow_slug_edit", type: "bool", value: true }],
    }),
  );
}

function translationOn(enabled: boolean) {
  return http.get(`${API}/public/settings`, () =>
    HttpResponse.json(
      enabled
        ? { "translation.enabled": true, "translation.locales": "en" }
        : { "translation.enabled": false },
    ),
  );
}

function signIn() {
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
  useAuthStore.getState().setAuthz(["admin"], ["cms.taxonomy.manage"]);
}

function renderDialog(target: ReturnType<typeof tag> | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <TagFormDialog open onOpenChange={() => {}} tag={target} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => signIn());
afterEach(() => useAuthStore.getState().clear());

describe("TagFormDialog translations", () => {
  it("edit: a tag is saved on its own — it has no translated copy", async () => {
    // Tags were translatable and nothing ever displayed the result: the site
    // renders no tags and the public article payload carries none. The entity
    // is gone from the translation module, so this dialog must not ask for a
    // language, and must not call a route that now answers 404.
    const calls: string[] = [];
    server.use(
      translationOn(true),
      settingsHandler(),
      http.get(`${API}/translations/tag/t1`, () => {
        calls.push("translation");
        return HttpResponse.json(trView());
      }),
      http.patch(`${API}/cms/tags/t1`, () => {
        calls.push("record");
        return HttpResponse.json(tag());
      }),
    );
    renderDialog(tag());

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(i18n.t("cms.tags.col.name"));
    expect(
      within(dialog).queryByText(i18n.t("cms.tags.translate.heading")),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("common.save") }),
    );
    await waitFor(() => expect(calls).toEqual(["record"]));
  });

  it("create: the dialog is the same two fields", async () => {
    server.use(translationOn(true), settingsHandler());
    renderDialog(null);

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(i18n.t("cms.tags.col.name"));
    expect(
      within(dialog).queryByText(i18n.t("cms.tags.translate.heading")),
    ).not.toBeInTheDocument();
  });

  // The header icon is the subject of the dialog — a tag — in both modes; the
  // title is what says whether it is being added or edited.
  it("the header wears the tag icon, adding or editing", async () => {
    for (const subject of [null, tag()]) {
      server.use(translationOn(true), settingsHandler());
      const view = renderDialog(subject);
      const dialog = await screen.findByRole("dialog");
      expect(dialog.querySelector("svg.lucide-tag")).toBeInTheDocument();
      expect(dialog.querySelector("svg.lucide-pencil")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("translation off: the dialog keeps its two fields", async () => {
    server.use(translationOn(false), settingsHandler());
    renderDialog(tag());

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByRole("textbox")).toHaveLength(2),
    );
  });
});
