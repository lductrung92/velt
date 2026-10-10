import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import TwoFactor from "./TwoFactor";

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

function profile(enabled: boolean, remaining: number | null) {
  return {
    user: USER,
    two_factor_enabled: enabled,
    recovery_codes_remaining: remaining,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TwoFactor />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("TwoFactor", () => {
  it("enroll flow: off → setup QR → enable → recovery codes (gated done)", async () => {
    server.use(
      http.get(`${API}/account/profile`, () =>
        HttpResponse.json(profile(false, null)),
      ),
      http.post(`${API}/account/2fa/setup`, () =>
        HttpResponse.json({
          otpauth_url: "otpauth://totp/velt:admin",
          qr_svg: "<svg><rect/></svg>",
          manual_key: "ABCDEF123456",
        }),
      ),
      http.post(`${API}/account/2fa/enable`, () =>
        HttpResponse.json({ recovery_codes: ["code-aaa", "code-bbb"] }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    // status_off → Enable button
    await user.click(
      await screen.findByRole("button", { name: /bật 2fa|enable 2fa/i }),
    );

    // setup_shown → manual key + code field
    expect(await screen.findByText("ABCDEF123456")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText(/mã xác thực|verification code/i),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: /xác nhận|confirm/i }));

    // recovery_shown → codes + gated Done
    expect(await screen.findByText("code-aaa")).toBeInTheDocument();
    const done = screen.getByRole("button", { name: /hoàn tất|done/i });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(done).toBeEnabled();
  });

  it("disable with wrong password → inline error, panel stays open", async () => {
    server.use(
      http.get(`${API}/account/profile`, () =>
        HttpResponse.json(profile(true, 5)),
      ),
      http.post(`${API}/account/2fa/disable`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "invalid_credentials", details: {} } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /tắt 2fa|disable 2fa/i }),
    );
    await user.type(
      screen.getByLabelText(/^mật khẩu|^password/i),
      "wrong-password",
    );
    // Confirm button inside the reauth panel (destructive "Disable").
    const buttons = screen.getAllByRole("button", {
      name: /tắt 2fa|disable 2fa/i,
    });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/không đúng|incorrect/i)).toBeInTheDocument(),
    );
  });
});
