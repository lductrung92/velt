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
  it("loads 5 switches with the response state; Save disabled until dirty", async () => {
    signIn(["cms.settings.read", "cms.settings.manage"]);
    server.use(
      http.get(`${API}/cms/settings`, () => HttpResponse.json(cmsView())),
    );
    const user = userEvent.setup();
    renderPage();

    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(5);
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

    expect(await screen.findByText(/permission|quyền/i)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled(); // still dirty → retryable
  });
});
