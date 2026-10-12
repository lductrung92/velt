import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import MemberEditor from "./MemberEditor";

const API = "http://localhost/api";

function member(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    slug: "an-nguyen",
    full_name: "An Nguyễn",
    role: "Backend Engineer",
    bio: "Xin chào",
    avatar_url: null,
    email: null,
    zalo: null,
    links: [{ label: "GitHub", url: "https://github.com/an" }],
    skills: ["Go"],
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function signIn(permissions: string[]) {
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
  useAuthStore.getState().setAuthz(["admin"], permissions);
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/members/new" element={<MemberEditor />} />
            <Route path="/members/:id" element={<MemberEditor />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["members.view", "members.manage"];

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("MemberEditor", () => {
  it("renders the create form without crashing", async () => {
    // Regression guard: a <FormLabel> outside any <FormField> throws
    // "useFormField must be used within <FormField>" and blanks the page.
    signIn(MANAGER);
    renderAt("/members/new");

    expect(await screen.findByLabelText(/Họ và tên/)).toBeInTheDocument();
    expect(screen.getByText(i18n.t("members.field.links"))).toBeInTheDocument();
  });

  it("offers the photo picker on a member that does not exist yet", async () => {
    // The blob waits in the browser until Save, so nothing here needs an id.
    signIn(MANAGER);
    renderAt("/members/new");
    expect(
      await screen.findByRole("button", {
        name: i18n.t("image.upload.trigger"),
      }),
    ).toBeInTheDocument();
  });

  it("requires a full name", async () => {
    signIn(MANAGER);
    const posted = vi.fn();
    server.use(
      http.post(`${API}/members`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(member(), { status: 201 });
      }),
    );
    renderAt("/members/new");

    await userEvent.click(
      await screen.findByRole("button", { name: i18n.t("common.save") }),
    );
    expect(
      await screen.findByText(i18n.t("errors.validation.required")),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("refuses a javascript: link before it reaches the server", async () => {
    signIn(MANAGER);
    const posted = vi.fn();
    server.use(
      http.post(`${API}/members`, async ({ request }) => {
        posted(await request.json());
        return HttpResponse.json(member(), { status: 201 });
      }),
    );
    renderAt("/members/new");

    await userEvent.type(await screen.findByLabelText(/Họ và tên/), "Test");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("members.add_link") }),
    );
    await userEvent.type(screen.getByPlaceholderText("Nhãn"), "Evil");
    await userEvent.type(
      screen.getByPlaceholderText("https://..."),
      "javascript:alert(1)",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    expect(
      await screen.findByText(i18n.t("errors.validation.invalid_url")),
    ).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it("loads an existing member into the form", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members/m1`, () => HttpResponse.json(member())),
    );
    renderAt("/members/m1");

    await waitFor(async () =>
      expect(await screen.findByLabelText(/Họ và tên/)).toHaveValue(
        "An Nguyễn",
      ),
    );
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://github.com/an"),
    ).toBeInTheDocument();
  });

  it("sends the edited fields on save", async () => {
    signIn(MANAGER);
    const patched = vi.fn();
    server.use(
      http.get(`${API}/members/m1`, () => HttpResponse.json(member())),
      http.patch(`${API}/members/m1`, async ({ request }) => {
        const body = await request.json();
        patched(body);
        return HttpResponse.json({ ...member(), ...(body as object) });
      }),
    );
    renderAt("/members/m1");

    const role = await screen.findByLabelText(/Vai trò/);
    await userEvent.clear(role);
    await userEvent.type(role, "Tech Lead");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).toMatchObject({ role: "Tech Lead" });
  });
});

describe("MemberEditor translations", () => {
  const TRANSLATION_FIELDS = ["role", "bio"];

  function translationView(values: Record<string, unknown> = {}) {
    return {
      entity: "member",
      entity_id: "m1",
      base_locale: "vi",
      locales: ["en"],
      translatable_fields: TRANSLATION_FIELDS,
      translations: { en: { values, updated_at: "2026-01-01T00:00:00Z" } },
      requires_republish: false,
    };
  }

  function translationHandlers() {
    return [
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      http.get(`${API}/members/m1`, () => HttpResponse.json(member())),
      http.get(`${API}/translations/member/m1`, () =>
        HttpResponse.json(translationView()),
      ),
    ];
  }

  it("offers no permalink before the member exists", async () => {
    signIn(MANAGER);
    server.use(...translationHandlers());
    renderAt("/members/new");

    expect(await screen.findByLabelText(/Họ và tên/)).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t("members.field.permalink")),
    ).not.toBeInTheDocument();
  });

  it("leaves an unchanged slug out of the save", async () => {
    signIn(MANAGER);
    const patched = vi.fn();
    server.use(
      ...translationHandlers(),
      http.patch(`${API}/members/m1`, async ({ request }) => {
        patched(await request.json());
        return HttpResponse.json(member());
      }),
    );
    renderAt("/members/m1");

    // The permalink is locked: the saved slug reads as text, not as an input.
    expect(await screen.findByText("an-nguyen")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(patched).toHaveBeenCalled());
    expect(patched.mock.calls[0][0]).not.toHaveProperty("slug");
  });

  it("stores the translation before the member itself is written", async () => {
    signIn(MANAGER);
    const calls: string[] = [];
    server.use(
      ...translationHandlers(),
      http.put(`${API}/translations/member/m1/en`, async ({ request }) => {
        calls.push("translation");
        await request.json();
        return HttpResponse.json(translationView({ role: "Tech Lead" }));
      }),
      http.patch(`${API}/members/m1`, async ({ request }) => {
        calls.push("member");
        await request.json();
        return HttpResponse.json(member());
      }),
    );
    renderAt("/members/m1");

    await userEvent.click(await screen.findByRole("tab", { name: /English/ }));
    await userEvent.type(
      screen.getByLabelText(i18n.t("members.field.role", { lng: "en" })),
      "Tech Lead",
    );
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("common.save") }),
    );

    await waitFor(() => expect(calls).toEqual(["translation", "member"]));
  });
});
