import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import AccountLayout from "./AccountLayout";
import ChangePassword from "./ChangePassword";
import Profile from "./Profile";
import TwoFactor from "./TwoFactor";

const API = "http://localhost/api";
const PROFILE = {
  user: {
    id: "u1",
    email: "admin@velt.local.vn",
    full_name: "System Admin",
    avatar_url: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  },
  two_factor_enabled: false,
  recovery_codes_remaining: null,
};

function renderAccount(initial = "/account/profile") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/account" element={<AccountLayout />}>
              <Route
                index
                element={<Navigate to="/account/profile" replace />}
              />
              <Route path="profile" element={<Profile />} />
              <Route path="password" element={<ChangePassword />} />
              <Route path="2fa" element={<TwoFactor />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("AccountLayout", () => {
  it("renders avatar identity, the three tabs, and the profile panel by default", async () => {
    server.use(
      http.get(`${API}/account/profile`, () => HttpResponse.json(PROFILE)),
    );
    renderAccount();

    // Left column shows identity from the (shared) profile query.
    expect(await screen.findByText("System Admin")).toBeInTheDocument();

    // Three route-driven tabs.
    expect(
      screen.getByRole("tab", { name: /thông tin cơ bản|basic info/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /đổi mật khẩu|change password/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /bảo mật 2fa|2fa security/i }),
    ).toBeInTheDocument();

    // Default panel = basic-info form (name field).
    expect(await screen.findByDisplayValue("System Admin")).toBeInTheDocument();
  });

  it("switches to the change-password panel when its tab is clicked", async () => {
    server.use(
      http.get(`${API}/account/profile`, () => HttpResponse.json(PROFILE)),
    );
    const user = userEvent.setup();
    renderAccount();

    await screen.findByDisplayValue("System Admin");
    await user.click(
      screen.getByRole("tab", { name: /đổi mật khẩu|change password/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText(/mật khẩu hiện tại|current password/i),
      ).toBeInTheDocument(),
    );
  });
});
