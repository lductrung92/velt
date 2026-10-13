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

import CmsSettings from "./CmsSettings";

const API = "http://localhost/api";

function cmsView(notify = false) {
  return {
    cms: [
      { key: "cms.article.categorize", type: "bool", value: true },
      { key: "cms.article.require_review", type: "bool", value: true },
      { key: "cms.article.allow_slug_edit", type: "bool", value: true },
      { key: "cms.publish.allow_now", type: "bool", value: true },
      { key: "cms.newsletter.notify_on_publish", type: "bool", value: notify },
    ],
  };
}

// Display order follows FLAGS: categorize, require_review, allow_slug_edit,
// allow_now, notify_on_publish. notify is the last switch (index 4).
const NOTIFY_IDX = 4;

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
        <MemoryRouter initialEntries={["/cms/settings"]}>
          <CmsSettings />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /lưu|^save$/i });

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("CmsSettings", () => {
  it("loads the flags with the response state; Save disabled until dirty", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
    );
    const user = userEvent.setup();
    renderPage();

    // Five feature flags plus the multilingual switch, which is the only other
    // on/off control on this screen.
    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(6);
    expect(switches[0]).toBeChecked();
    expect(switches[NOTIFY_IDX]).not.toBeChecked(); // notify_on_publish = false
    expect(saveButton()).toBeDisabled();

    await user.click(switches[NOTIFY_IDX]);
    expect(saveButton()).toBeEnabled();
  });

  it("save sends ONLY the dirty flag then resyncs (Save disabled again)", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    let putBody: unknown;
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
      http.put(`${API}/cms/settings`, async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json(cmsView(true));
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const switches = await screen.findAllByRole("switch");
    await user.click(switches[NOTIFY_IDX]); // toggle notify_on_publish on
    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(putBody).toEqual({
      updates: { "cms.newsletter.notify_on_publish": true },
    });
    // Resynced from the response: notify switch now reflects the saved value.
    expect((await screen.findAllByRole("switch"))[NOTIFY_IDX]).toBeChecked();
  });

  it("read-only (read without manage): switches disabled + no Save button", async () => {
    signIn(["cms.settings.read"]);
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
    );
    renderPage();

    const switches = await screen.findAllByRole("switch");
    switches.forEach((s) => expect(s).toBeDisabled());
    expect(
      screen.queryByRole("button", { name: /lưu|^save$/i }),
    ).not.toBeInTheDocument();
  });

  it("load failure → Alert + retry button (no form)", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    server.use(
      http.get(
        `${API}/cms/settings`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderPage();

    // GET 500 is retried by axios-retry (exponential backoff) before failing.
    expect(
      await screen.findByRole(
        "button",
        { name: /thử lại|try again/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("site chrome: a changed field is sent, an untouched one is not", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    let putBody: { updates: Record<string, unknown> } | undefined;
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
      http.put(`${API}/cms/settings`, async ({ request }) => {
        putBody = (await request.json()) as typeof putBody;
        return HttpResponse.json(cmsView());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    // The copyright line is a plain string setting; the cache TTL is the one
    // number on the screen and must not be sent as text.
    const copyright = await screen.findByLabelText(
      i18n.t("cms.settings.site.footer_copyright.label"),
    );
    // "{{" is user-event's escape for a literal brace; {year} is the
    // placeholder the site swaps for the current year.
    await user.type(copyright, "© {{year} ZUKATEK.");
    const ttl = screen.getByLabelText(
      i18n.t("cms.settings.site.cache_ttl.label"),
    );
    await user.clear(ttl);
    await user.type(ttl, "120");
    await user.click(saveButton());

    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody?.updates).toEqual({
      "site.footer_copyright": "© {year} ZUKATEK.",
      "site.cache_ttl_seconds": 120,
    });
  });

  it("site chrome: the English boxes are stored as a translation", async () => {
    // The chrome is one record with a fixed id, so the other languages go to
    // the translation endpoint while the Vietnamese boxes stay settings.
    const CHROME = "00000000-0000-0000-0000-00005174e000";
    signIn(["cms.settings.read", "cms.settings.manage"]);
    let trBody: { values?: Record<string, unknown> } | undefined;
    const calls: string[] = [];
    server.use(
      http.get(`${API}/public/settings`, () =>
        HttpResponse.json({
          "translation.enabled": true,
          "translation.locales": "en",
        }),
      ),
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
      http.get(`${API}/translations/site_chrome/${CHROME}`, () =>
        HttpResponse.json({
          entity: "site_chrome",
          entity_id: CHROME,
          base_locale: "vi",
          locales: ["en"],
          translatable_fields: [
            "brand_tagline",
            "footer_note_title",
            "footer_note_text",
            "footer_copyright",
            "header_cta_label",
            "header_cta_url",
          ],
          translations: {},
          requires_republish: false,
        }),
      ),
      http.put(`${API}/translations/site_chrome/${CHROME}/en`, async ({ request }) => {
        calls.push("translation");
        trBody = (await request.json()) as typeof trBody;
        return HttpResponse.json({ ok: true });
      }),
      http.put(`${API}/cms/settings`, () => {
        calls.push("settings");
        return HttpResponse.json(cmsView());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    // Switch the chrome block to English, then type into the button label.
    const toEnglish = await screen.findByRole("button", { name: "EN" });
    await user.click(toEnglish);
    const label = screen.getByLabelText(
      i18n.t("cms.settings.site.header_cta_label.label"),
    );
    await user.type(label, "Contact us");
    await user.click(saveButton());

    await waitFor(() => expect(calls).toContain("translation"));
    expect(trBody?.values).toMatchObject({ header_cta_label: "Contact us" });
  });

  it("save 403 → access-denied banner; flags stay dirty", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
      http.put(`${API}/cms/settings`, () =>
        HttpResponse.json(
          { error: { code: 403, message: "access_denied" } },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    const switches = await screen.findAllByRole("switch");
    await user.click(switches[NOTIFY_IDX]);
    await user.click(saveButton());

    // The exact banner, not a /quyền/ match: the site-chrome fields put that
    // word on a field label too ("Dòng bản quyền"), and a loose pattern there
    // would pass on the wrong element.
    expect(
      await screen.findByText(i18n.t("errors.access_denied")),
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled(); // still dirty → retryable
  });
});
