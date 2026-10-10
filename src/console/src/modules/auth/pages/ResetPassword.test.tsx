import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import ResetPassword from "./ResetPassword";

const API = "http://localhost/api";
const NEW_PW_LABEL = /^(mật khẩu mới|new password)/i;
const CONFIRM_LABEL = /^(nhập lại mật khẩu|confirm password)/i;

function renderPage(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/login" element={<div>LOGIN_OK</div>} />
            <Route path="/forgot-password" element={<div>FORGOT_OK</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("ResetPassword", () => {
  it("no token → shows the missing-link panel, no form", () => {
    renderPage("/reset-password");
    expect(screen.queryByLabelText(NEW_PW_LABEL)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /yêu cầu link mới|request a new link/i,
      }),
    ).toBeInTheDocument();
  });

  it("valid token → resets password → redirects to /login", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderPage("/reset-password?token=good-token");

    await user.type(screen.getByLabelText(NEW_PW_LABEL), "brand-new-password");
    await user.type(screen.getByLabelText(CONFIRM_LABEL), "brand-new-password");
    await user.click(
      screen.getByRole("button", { name: /đặt lại mật khẩu|reset password/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("LOGIN_OK")).toBeInTheDocument(),
    );
  });

  it("invalid_or_expired_token → full-panel error with a new-link CTA", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json(
          {
            error: {
              code: 422,
              message: "invalid_or_expired_token",
              details: {},
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage("/reset-password?token=stale-token");

    await user.type(screen.getByLabelText(NEW_PW_LABEL), "brand-new-password");
    await user.type(screen.getByLabelText(CONFIRM_LABEL), "brand-new-password");
    await user.click(
      screen.getByRole("button", { name: /đặt lại mật khẩu|reset password/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", {
          name: /yêu cầu link mới|request a new link/i,
        }),
      ).toBeInTheDocument(),
    );
    // The form is gone (terminal panel).
    expect(screen.queryByLabelText(NEW_PW_LABEL)).not.toBeInTheDocument();
  });

  it("422 weak password → inline field error, stays on the form", async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json(
          {
            error: {
              code: 422,
              message: "validation_error",
              details: { fields: { new_password: "too_common" } },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage("/reset-password?token=good-token");

    await user.type(screen.getByLabelText(NEW_PW_LABEL), "password1234");
    await user.type(screen.getByLabelText(CONFIRM_LABEL), "password1234");
    await user.click(
      screen.getByRole("button", { name: /đặt lại mật khẩu|reset password/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/quá phổ biến|too common/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(NEW_PW_LABEL)).toBeInTheDocument();
  });
});
