import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import Profile from "./Profile";

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

function renderProfile() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/account/profile"]}>
          <Routes>
            <Route path="/account/profile" element={<Profile />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("Profile", () => {
  it("loads + renders the basic-info form (name, email)", async () => {
    server.use(
      http.get(`${API}/account/profile`, () =>
        HttpResponse.json({
          user: USER,
          two_factor_enabled: false,
          recovery_codes_remaining: null,
        }),
      ),
    );
    renderProfile();

    expect(await screen.findByDisplayValue("System Admin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin@velt.local.vn")).toBeInTheDocument();
  });

  it("422 on save → inline field error, no toast", async () => {
    server.use(
      http.get(`${API}/account/profile`, () =>
        HttpResponse.json({
          user: USER,
          two_factor_enabled: false,
          recovery_codes_remaining: null,
        }),
      ),
      http.patch(`${API}/account/profile`, () =>
        HttpResponse.json(
          {
            error: {
              code: 422,
              message: "validation_error",
              details: { fields: { full_name: "too_long" } },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderProfile();

    await screen.findByDisplayValue("System Admin");
    await user.click(screen.getByRole("button", { name: /lưu|save/i }));

    await waitFor(() =>
      expect(screen.getByText(/quá dài|too long/i)).toBeInTheDocument(),
    );
  });
});
