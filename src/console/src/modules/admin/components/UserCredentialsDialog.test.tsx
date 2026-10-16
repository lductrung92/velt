import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import { UserCredentialsDialog } from "./UserCredentialsDialog";
import type { AdminUser } from "../services/admin.service";

const API = "http://localhost/api";

const USER: AdminUser = {
  id: "u2",
  email: "jane@velt.local.vn",
  full_name: "Jane Doe",
  avatar_url: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
  roles: [{ id: "r1", code: "editor", name: "Editor" }],
  two_factor_enabled: false,
};

function renderDialog(initialPassword?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <UserCredentialsDialog
          user={USER}
          initialPassword={initialPassword}
          onClose={() => {}}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("UserCredentialsDialog", () => {
  it("shows the login and masks the temporary password until revealed", async () => {
    renderDialog("Sup3rSecretTemp");
    const dialog = await screen.findByRole("dialog");

    expect(screen.getByText(USER.email)).toBeInTheDocument();
    // Masked by default: the plaintext must not be on screen on open.
    expect(screen.queryByText("Sup3rSecretTemp")).not.toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("admin.users.temp_password_once")),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("common.show_password"),
      }),
    );
    expect(screen.getByText("Sup3rSecretTemp")).toBeInTheDocument();
  });

  it("copies the temporary password to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDialog("Sup3rSecretTemp");
    await screen.findByRole("dialog");

    const copies = screen.getAllByRole("button", { name: i18n.t("common.copy") });
    // Two copy buttons: the login, then the password.
    await userEvent.click(copies[1]);
    expect(writeText).toHaveBeenCalledWith("Sup3rSecretTemp");
  });

  it("regenerate asks the server for a new temporary password and shows it", async () => {
    server.use(
      http.post(`${API}/admin/users/u2/reset-password`, () =>
        HttpResponse.json({ ...USER, temporary_password: "FreshTempPass99" }),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    // Nothing readable before a regenerate — the stored hash can't be shown.
    expect(
      screen.getByText(i18n.t("admin.users.temp_password_hidden")),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("admin.users.regenerate"),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(i18n.t("admin.users.temp_password_once")),
      ).toBeInTheDocument(),
    );
    // Still masked until the admin asks to see it.
    expect(screen.queryByText("FreshTempPass99")).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("common.show_password"),
      }),
    );
    expect(screen.getByText("FreshTempPass99")).toBeInTheDocument();
  });

  it("surfaces a server refusal instead of a stale password", async () => {
    server.use(
      http.post(`${API}/admin/users/u2/reset-password`, () =>
        HttpResponse.json(
          { error: { code: 409, message: "conflict", details: {} } },
          { status: 409 },
        ),
      ),
    );
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: i18n.t("admin.users.regenerate"),
      }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(i18n.t("admin.users.temp_password_hidden")),
    ).toBeInTheDocument();
  });
});
