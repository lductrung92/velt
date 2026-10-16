import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ActivityLog from "./ActivityLog";
import Sessions from "./Sessions";

const t = (key: string) => i18n.t(key);

// What the purge endpoints were actually asked for. The window code is the
// whole contract between this screen and the server, so it is what the tests
// assert on.
let purged: { url: string; body: unknown } | null = null;

function servePurge(deleted = 7) {
  server.use(
    http.get("*/activity/actions", () => HttpResponse.json({ items: [] })),
    http.get("*/activity", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 }),
    ),
    http.get("*/admin/sessions", () =>
      HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 }),
    ),
    http.post("*/activity/purge", async ({ request }) => {
      purged = { url: "activity", body: await request.json() };
      return HttpResponse.json({ deleted });
    }),
    http.post("*/admin/sessions/purge", async ({ request }) => {
      purged = { url: "sessions", body: await request.json() };
      return HttpResponse.json({ deleted });
    }),
  );
}

function mount(screenEl: React.ReactElement, permissions: string[]) {
  useAuthStore.getState().setAuthz([], permissions);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{screenEl}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  purged = null;
  useAuthStore.getState().clear();
});
afterEach(() => useAuthStore.getState().clear());

describe("Clean-up modal", () => {
  it("warns, refuses to run until a window is chosen, and sends the code", async () => {
    servePurge(12);
    const user = userEvent.setup();
    mount(<ActivityLog />, ["activity.read", "activity.purge"]);

    await user.click(
      await screen.findByRole("button", { name: t("activity.cleanup") }),
    );

    const dialog = await screen.findByRole("dialog");
    // The header is the shared one: the action on top, what it acts on under it.
    expect(within(dialog).getByText(t("admin.cleanup.title"))).toBeVisible();
    expect(within(dialog).getByText(t("activity.list_title"))).toBeVisible();
    // The warning has to be on screen before anything can be deleted.
    expect(
      within(dialog).getByText(t("activity.cleanup_warning")),
    ).toBeVisible();

    const confirm = within(dialog).getByRole("button", {
      name: t("admin.cleanup.confirm"),
    });
    expect(confirm).toBeDisabled();

    await user.click(
      screen.getByRole("combobox", { name: t("admin.cleanup.window_label") }),
    );
    await user.click(
      await screen.findByRole("option", { name: t("admin.cleanup.window.3d") }),
    );
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() =>
      expect(purged).toEqual({ url: "activity", body: { older_than: "3d" } }),
    );
    // Closing on success is what tells the operator it ran.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("offers every retention window the backend accepts", async () => {
    servePurge();
    const user = userEvent.setup();
    mount(<ActivityLog />, ["activity.read", "activity.purge"]);

    await user.click(
      await screen.findByRole("button", { name: t("activity.cleanup") }),
    );
    await user.click(
      await screen.findByRole("combobox", {
        name: t("admin.cleanup.window_label"),
      }),
    );
    for (const code of ["all", "3d", "7d", "1m", "3m", "6m", "1y"]) {
      expect(
        await screen.findByRole("option", {
          name: t(`admin.cleanup.window.${code}`),
        }),
      ).toBeVisible();
    }
  });

  it("is not offered at all without the purge permission", async () => {
    servePurge();
    mount(<ActivityLog />, ["activity.read"]);

    expect(
      await screen.findByRole("button", { name: t("common.refresh") }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: t("activity.cleanup") }),
    ).not.toBeInTheDocument();
  });

  it("sends 'all' from the sessions screen and says the caller is spared", async () => {
    servePurge(3);
    const user = userEvent.setup();
    mount(<Sessions />, ["sessions.read", "sessions.revoke"]);

    await user.click(
      await screen.findByRole("button", { name: t("admin.sessions.cleanup") }),
    );
    // The one thing the operator must be told before deleting sessions.
    expect(
      await screen.findByText(t("admin.sessions.cleanup_warning")),
    ).toBeVisible();

    await user.click(
      screen.getByRole("combobox", { name: t("admin.cleanup.window_label") }),
    );
    await user.click(
      await screen.findByRole("option", {
        name: t("admin.cleanup.window.all"),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: t("admin.cleanup.confirm") }),
    );

    await waitFor(() =>
      expect(purged).toEqual({ url: "sessions", body: { older_than: "all" } }),
    );
  });

  it("is styled as the destructive action it is on both screens", async () => {
    servePurge();
    const activity = mount(<ActivityLog />, [
      "activity.read",
      "activity.purge",
    ]);
    // It deletes rows for good, so it wears the destructive fill, not an
    // outline that reads like "refresh".
    expect(
      await screen.findByRole("button", { name: t("activity.cleanup") }),
    ).toHaveClass("bg-destructive");
    activity.unmount();

    mount(<Sessions />, ["sessions.read", "sessions.revoke"]);
    expect(
      await screen.findByRole("button", { name: t("admin.sessions.cleanup") }),
    ).toHaveClass("bg-destructive");
  });

  it("is not offered to someone who cannot revoke sessions", async () => {
    servePurge();
    mount(<Sessions />, ["sessions.read"]);

    expect(
      await screen.findByRole("button", { name: t("common.refresh") }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: t("admin.sessions.cleanup") }),
    ).not.toBeInTheDocument();
  });
});
