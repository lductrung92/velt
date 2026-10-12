import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import PageEditor from "./PageEditor";

// Tiptap/ProseMirror doesn't run in jsdom — swap the editor for a textarea that
// drives onChange(html, json). The Puck designer never mounts in these cases.
vi.mock("@/components/common/RichTextEditor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string, json: unknown) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value, { type: "doc" })}
    />
  ),
}));

const API = "http://localhost/api";
const ID = "p1";

function pageDetail(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: "Giới thiệu",
    slug: "gioi-thieu",
    body_html: "<p>xin chào</p>",
    body_json: null,
    parent_id: null,
    sort_order: 0,
    template: null,
    status: "draft",
    og_path: null,
    landing_id: null,
    seo: {
      title: null,
      description: null,
      keywords: null,
      canonical_url: null,
      noindex: false,
      nofollow: false,
      og_title: null,
      og_description: null,
    },
    published_at: null,
    published_snapshot: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "u-1",
    ...over,
  };
}

function translationView(values: Record<string, unknown> = {}) {
  return {
    entity: "page",
    entity_id: ID,
    base_locale: "vi",
    locales: ["en"],
    translatable_fields: ["slug", "title", "body_html", "seo"],
    translations: { en: { values, updated_at: "2026-01-01T00:00:00Z" } },
    requires_republish: false,
  };
}

function baseHandlers() {
  return [
    http.get(`${API}/public/settings`, () =>
      HttpResponse.json({
        "translation.enabled": true,
        "translation.locales": "en",
      }),
    ),
    http.get(`${API}/cms/settings`, () =>
      HttpResponse.json({
        cms: [
          { key: "cms.article.allow_slug_edit", type: "bool", value: true },
        ],
      }),
    ),
    http.get(`${API}/cms/pages/${ID}`, () => HttpResponse.json(pageDetail())),
    http.get(`${API}/translations/page/${ID}`, () =>
      HttpResponse.json(translationView()),
    ),
  ];
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
  useAuthStore
    .getState()
    .setAuthz(["admin"], ["cms.page.create", "cms.page.publish"]);
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/cms/pages/new" element={<PageEditor />} />
            <Route path="/cms/pages/:id" element={<PageEditor />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const save = () => screen.getByRole("button", { name: i18n.t("common.save") });

beforeEach(() => {
  useAuthStore.getState().clear();
  signIn();
  server.use(...baseHandlers());
});

describe("PageEditor", () => {
  it("offers no permalink before the page exists", async () => {
    renderAt("/cms/pages/new");

    expect(
      await screen.findByLabelText(
        new RegExp(`^${i18n.t("cms.pages.field.title")}\\*`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t("cms.pages.editor.permalink")),
    ).not.toBeInTheDocument();
  });

  it("shows the saved permalink locked once the page exists", async () => {
    renderAt(`/cms/pages/${ID}`);

    expect(
      await screen.findByText(i18n.t("cms.pages.editor.permalink")),
    ).toBeInTheDocument();
    expect(screen.getByText("gioi-thieu")).toBeInTheDocument();
    // Locked: the value is text until the edit button is used.
    expect(screen.queryByDisplayValue("gioi-thieu")).not.toBeInTheDocument();
  });

  it("leaves an unchanged slug out of the save", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API}/cms/pages/${ID}`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json(pageDetail());
      }),
    );
    renderAt(`/cms/pages/${ID}`);

    await screen.findByText("gioi-thieu");
    await userEvent.click(save());

    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).not.toHaveProperty("slug");
  });

  it("sends the slug once it has been unlocked and changed", async () => {
    const patched = vi.fn();
    server.use(
      http.patch(`${API}/cms/pages/${ID}`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json(pageDetail({ slug: "ve-chung-toi" }));
      }),
    );
    renderAt(`/cms/pages/${ID}`);

    await screen.findByText("gioi-thieu");
    await userEvent.click(screen.getByRole("button", { name: /Sửa/ }));
    const input = screen.getByDisplayValue("gioi-thieu");
    await userEvent.clear(input);
    await userEvent.type(input, "ve-chung-toi");
    await userEvent.click(save());

    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).toMatchObject({ slug: "ve-chung-toi" });
  });

  it("stores the translation before the page itself is written", async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${API}/translations/page/${ID}/en`, async ({ request }) => {
        calls.push("translation");
        await request.json();
        return HttpResponse.json(translationView({ title: "About us" }));
      }),
      http.patch(`${API}/cms/pages/${ID}`, async ({ request }) => {
        calls.push("page");
        await request.json();
        return HttpResponse.json(pageDetail());
      }),
    );
    renderAt(`/cms/pages/${ID}`);

    await userEvent.click(await screen.findByRole("tab", { name: /English/ }));
    await userEvent.type(
      screen.getByLabelText(i18n.t("cms.pages.field.title", { lng: "en" })),
      "About us",
    );
    await userEvent.click(save());

    // Publishing reads the stored translations, so a translation written after
    // the page would need a second Save to reach the site.
    await waitFor(() => expect(calls).toEqual(["translation", "page"]));
  });
});
