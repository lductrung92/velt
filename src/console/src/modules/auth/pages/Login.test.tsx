import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import Login from "./Login";

const API = "http://localhost/api";
const USER = {
  id: "u1",
  email: "admin@velt.local.vn",
  full_name: "System Admin",
  avatar_url: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
};

function renderLogin(initialEntry = "/login") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<div>HOME_OK</div>} />
            <Route path="/dashboard" element={<div>HOME_OK</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().clear();
});

describe("Login", () => {
  it("logs in (no 2FA) → sets session, hydrates authz + redirects", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({
          access_token: "tok-123",
          token_type: "Bearer",
          expires_in: 900,
          user: USER,
        }),
      ),
      // F1: login now fetches /auth/me to hydrate roles/permissions.
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({
          user: USER,
          roles: ["admin"],
          permissions: ["users.read"],
        }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "admin@velt.local.vn");
    await user.type(
      screen.getByLabelText(/^(mật khẩu|password)/i),
      "secret-pass",
    );
    await user.click(
      screen.getByRole("button", { name: /đăng nhập|sign in/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("HOME_OK")).toBeInTheDocument(),
    );
    expect(useAuthStore.getState().accessToken).toBe("tok-123");
    expect(useAuthStore.getState().user?.email).toBe("admin@velt.local.vn");
    expect(useAuthStore.getState().permissions).toContain("users.read");
  });

  it("invalid_credentials → inline alert, stays on login, no session", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "invalid_credentials", details: {} } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "admin@velt.local.vn");
    await user.type(screen.getByLabelText(/^(mật khẩu|password)/i), "wrong");
    await user.click(
      screen.getByRole("button", { name: /đăng nhập|sign in/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /không đúng|incorrect/i,
      ),
    );
    expect(screen.queryByText("HOME_OK")).not.toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("2FA flow → challenge step then verify → redirects", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({
          two_factor_required: true,
          challenge_token: "chal-1",
        }),
      ),
      http.post(`${API}/auth/2fa/verify`, () =>
        HttpResponse.json({
          access_token: "tok-2fa",
          token_type: "Bearer",
          expires_in: 900,
          user: USER,
        }),
      ),
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({
          user: USER,
          roles: ["admin"],
          permissions: ["users.read"],
        }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "admin@velt.local.vn");
    await user.type(
      screen.getByLabelText(/^(mật khẩu|password)/i),
      "secret-pass",
    );
    await user.click(
      screen.getByRole("button", { name: /đăng nhập|sign in/i }),
    );

    // Step 2 appears.
    const codeInput = await screen.findByLabelText(/2 bước|two-factor/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    expect(codeInput).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: /xác minh|verify/i }));

    await waitFor(() =>
      expect(screen.getByText("HOME_OK")).toBeInTheDocument(),
    );
    expect(useAuthStore.getState().accessToken).toBe("tok-2fa");
    expect(useAuthStore.getState().permissions).toContain("users.read");
  });
});
