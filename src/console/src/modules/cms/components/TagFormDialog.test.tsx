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
  it("edit: the translated name is written before the tag itself", async () => {
    const calls: string[] = [];
    let putBody: Record<string, unknown> | undefined;
    server.use(
      translationOn(true),
      settingsHandler(),
      http.get(`${API}/translations/tag/t1`, () => HttpResponse.json(trView())),
      http.put(`${API}/translations/tag/t1/en`, async ({ request }) => {
        calls.push("translation");
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(trView({ name: "Go" }));
      }),
      http.patch(`${API}/cms/tags/t1`, () => {
        calls.push("record");
        return HttpResponse.json(tag());
      }),
    );
    renderDialog(tag());

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      await within(dialog).findByLabelText(
        i18n.t("cms.tags.translate.heading"),
      ),
      "Go",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(calls).toEqual(["translation", "record"]));
    expect(putBody).toMatchObject({ values: { name: "Go" } });
  });

  it("create: nothing to translate until the tag exists", async () => {
    server.use(translationOn(true), settingsHandler());
    renderDialog(null);

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(i18n.t("cms.tags.col.name"));
    expect(
      within(dialog).queryByText(i18n.t("cms.tags.translate.heading")),
    ).not.toBeInTheDocument();
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
