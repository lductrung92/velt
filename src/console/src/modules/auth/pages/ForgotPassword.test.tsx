import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import ForgotPassword from "./ForgotPassword";

const API = "http://localhost/api";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/forgot-password"]}>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/login" element={<div>LOGIN_OK</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("ForgotPassword", () => {
  it("submits → shows generic success, hides the form, offers resend", async () => {
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), "user@velt.local.vn");
    await user.click(
      screen.getByRole("button", { name: /gửi link|send reset/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/nếu email tồn tại|if that email exists/i),
      ).toBeInTheDocument(),
    );
    // Email input is gone (form replaced by the generic-success panel).
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    // Resend is disabled during the cooldown.
    expect(
      screen.getByRole("button", { name: /gửi lại sau|resend in/i }),
    ).toBeDisabled();
  });

  it("422 invalid email → inline field error, stays on the form", async () => {
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json(
          {
            error: {
              code: 422,
              message: "validation_error",
              details: { fields: { email: "invalid_email" } },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    // Bypass the client schema by typing a value it accepts, then let the
    // server reject it (the client zod email check would otherwise block it).
    await user.type(screen.getByLabelText(/email/i), "user@velt.local.vn");
    await user.click(
      screen.getByRole("button", { name: /gửi link|send reset/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/email không hợp lệ|invalid email/i),
      ).toBeInTheDocument(),
    );
    // Still on the form (not the success panel).
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
