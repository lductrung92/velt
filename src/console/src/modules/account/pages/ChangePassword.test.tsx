import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import ChangePassword from "./ChangePassword";

const API = "http://localhost/api";
const CURRENT = /^mật khẩu hiện tại|^current password/i;
const NEW = /^mật khẩu mới|^new password/i;
const CONFIRM = /^nhập lại mật khẩu mới|^confirm new password/i;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/account/password"]}>
          <Routes>
            <Route path="/account/password" element={<ChangePassword />} />
            <Route path="/login" element={<div>LOGIN_OK</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => useAuthStore.getState().clear());

describe("ChangePassword", () => {
  it("happy → swaps in-memory access token + resets form (stays signed in)", async () => {
    server.use(
      http.post(`${API}/account/change-password`, () =>
        HttpResponse.json({
          access_token: "new-tok",
          token_type: "Bearer",
          expires_in: 900,
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(CURRENT), "old-password");
    await user.type(screen.getByLabelText(NEW), "brand-new-password");
    await user.type(screen.getByLabelText(CONFIRM), "brand-new-password");
    await user.click(screen.getByRole("button", { name: /lưu|save/i }));

    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe("new-tok"),
    );
    // Form reset → current password field cleared.
    expect(screen.getByLabelText(CURRENT)).toHaveValue("");
  });

  it("401 invalid_credentials → inline error on current password", async () => {
    server.use(
      http.post(`${API}/account/change-password`, () =>
        HttpResponse.json(
          { error: { code: 401, message: "invalid_credentials", details: {} } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(CURRENT), "wrong-current");
    await user.type(screen.getByLabelText(NEW), "brand-new-password");
    await user.type(screen.getByLabelText(CONFIRM), "brand-new-password");
    await user.click(screen.getByRole("button", { name: /lưu|save/i }));

    await waitFor(() =>
      expect(screen.getByText(/không đúng|incorrect/i)).toBeInTheDocument(),
    );
  });

  it("confirm mismatch → client inline error, no API call", async () => {
    // No MSW handler → an API call would throw (onUnhandledRequest: error).
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(CURRENT), "old-password");
    await user.type(screen.getByLabelText(NEW), "brand-new-password");
    await user.type(screen.getByLabelText(CONFIRM), "different-password");
    await user.click(screen.getByRole("button", { name: /lưu|save/i }));

    await waitFor(() =>
      expect(screen.getByText(/không khớp|do not match/i)).toBeInTheDocument(),
    );
  });
});
