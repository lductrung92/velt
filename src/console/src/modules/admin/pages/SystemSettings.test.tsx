import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import SystemSettings from "./SystemSettings";

const API = "http://localhost/api";

// The shape the registry hands the screen: type, format and the secret's
// is_set — everything the form needs to render itself.
function view() {
  return {
    general: [
      { key: "app.name", type: "string", is_public: true, value: "Zukatek" },
      {
        key: "app.primary_color",
        type: "string",
        format: "color",
        is_public: true,
        value: "",
      },
    ],
    site: [
      {
        key: "site.cache_ttl_seconds",
        type: "int",
        is_public: true,
        value: 60,
      },
      { key: "site.brand_tagline", type: "string", is_public: true, value: "" },
    ],
    email: [
      { key: "mail.smtp_host", type: "string", value: "" },
      { key: "mail.smtp_password", type: "secret", is_set: true },
    ],
    cms: [
      { key: "cms.article.categorize", type: "bool", value: false },
      { key: "cms.home_page_slug", type: "string", is_public: true, value: "" },
    ],
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
        <MemoryRouter initialEntries={["/admin/settings"]}>
          <SystemSettings />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /lưu|^save$/i });

beforeEach(() => {
  useAuthStore.getState().clear();
  server.use(
    http.get(`${API}/public/settings`, () => HttpResponse.json({})),
    http.get(`${API}/cms/pages`, () => HttpResponse.json([])),
  );
});
afterEach(() => useAuthStore.getState().clear());

describe("SystemSettings", () => {
  it("builds the form from the registry, including a group it has never seen", async () => {
    signIn(["settings.manage"]);
    server.use(
      http.get(`${API}/settings`, () =>
        HttpResponse.json({
          ...view(),
          // A group the console knows nothing about still renders: that is the
          // promise of reading the registry instead of listing keys here.
          future: [{ key: "future.thing", type: "string", value: "x" }],
        }),
      ),
    );
    renderPage();

    await screen.findByRole("tab", { name: i18n.t("settings.group.general") });
    expect(
      screen.getByRole("tab", { name: i18n.t("settings.group.email") }),
    ).toBeInTheDocument();
    // No label for the unknown group or key → its id is shown, which is ugly
    // enough to notice and harmless enough to ship.
    expect(screen.getByRole("tab", { name: "future" })).toBeInTheDocument();
    expect(
      screen.getByLabelText(i18n.t("settings.label.app_name")),
    ).toHaveValue("Zukatek");
    expect(saveButton()).toBeDisabled();
  });

  it("sends only what changed, with the type each key declares", async () => {
    signIn(["settings.manage"]);
    let body: { updates?: Record<string, unknown> } | undefined;
    server.use(
      http.get(`${API}/settings`, () => HttpResponse.json(view())),
      http.put(`${API}/settings`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(view());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText(
      i18n.t("settings.label.app_name"),
    );
    await user.clear(name);
    await user.type(name, "ZUKATEK");

    // A number stays a number and a switch stays a boolean.
    await user.click(
      screen.getByRole("tab", { name: i18n.t("settings.group.site") }),
    );
    const ttl = await screen.findByLabelText(
      i18n.t("settings.label.site_cache_ttl_seconds"),
    );
    await user.clear(ttl);
    await user.type(ttl, "120");

    await user.click(
      screen.getByRole("tab", { name: i18n.t("settings.group.cms") }),
    );
    await user.click(await screen.findByRole("switch"));

    await user.click(saveButton());
    await waitFor(() => expect(body).toBeDefined());
    expect(body?.updates).toEqual({
      "app.name": "ZUKATEK",
      "site.cache_ttl_seconds": 120,
      "cms.article.categorize": true,
    });
  });

  it("a stored secret is never shown, and an empty box never clears it", async () => {
    signIn(["settings.manage"]);
    let body: { updates?: Record<string, unknown> } | undefined;
    server.use(
      http.get(`${API}/settings`, () => HttpResponse.json(view())),
      http.put(`${API}/settings`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(view());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: i18n.t("settings.group.email") }),
    );
    const secret = await screen.findByLabelText(
      i18n.t("settings.label.mail_smtp_password"),
    );
    expect(secret).toHaveValue("");
    expect(screen.getByText(i18n.t("settings.secret.set"))).toBeInTheDocument();

    // Change something else and save: the untouched secret is not in the body.
    const host = screen.getByLabelText(i18n.t("settings.label.mail_smtp_host"));
    await user.type(host, "smtp.test");
    await user.click(saveButton());
    await waitFor(() => expect(body).toBeDefined());
    expect(body?.updates).toEqual({ "mail.smtp_host": "smtp.test" });
  });

  it("the email test posts the address, and says so", async () => {
    signIn(["settings.manage"]);
    let to: string | undefined;
    server.use(
      http.get(`${API}/settings`, () => HttpResponse.json(view())),
      http.post(`${API}/settings/email/test`, async ({ request }) => {
        to = ((await request.json()) as { to: string }).to;
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: i18n.t("settings.group.email") }),
    );
    await user.type(
      await screen.findByLabelText(i18n.t("settings.email_test.label")),
      "me@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: i18n.t("settings.email_test.run") }),
    );
    await waitFor(() => expect(to).toBe("me@example.com"));
  });

  it("an editor reads and writes through the CMS-scoped door", async () => {
    // Only cms.settings.manage: the server's own configuration is none of this
    // person's business, and the endpoint enforces that — the screen simply
    // asks the door they are allowed through.
    signIn(["cms.settings.manage"]);
    let scopedRead = false;
    let scopedWrite = false;
    server.use(
      http.get(`${API}/settings`, () => {
        throw new Error("the admin endpoint must not be called");
      }),
      http.get(`${API}/cms/settings`, () => {
        scopedRead = true;
        return HttpResponse.json({ cms: view().cms, site: view().site });
      }),
      http.put(`${API}/cms/settings`, () => {
        scopedWrite = true;
        return HttpResponse.json({ cms: view().cms, site: view().site });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(scopedRead).toBe(true));
    const dialog = screen.getByRole("tab", { name: i18n.t("settings.group.cms") });
    await user.click(dialog);
    await user.click(await screen.findByRole("switch"));
    await user.click(saveButton());
    await waitFor(() => expect(scopedWrite).toBe(true));
  });
});
