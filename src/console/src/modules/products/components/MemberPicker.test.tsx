import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import { MemberPicker, type ProductMemberDraft } from "./MemberPicker";

const API = "http://localhost/api";

function member(id: string, name: string, role: string | null = null) {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    full_name: name,
    role,
    bio: null,
    avatar_url: null,
    email: null,
    zalo: null,
    links: [],
    skills: [],
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function draft(id: string, name: string, role = ""): ProductMemberDraft {
  return {
    member_id: id,
    full_name: name,
    slug: name.toLowerCase(),
    avatar_url: null,
    default_role: "Backend Engineer",
    role,
  };
}

// Controlled component — drive it through a host so the tests exercise the same
// round-trip the editor does.
function Host({ initial = [] as ProductMemberDraft[], disabled = false }) {
  const [value, setValue] = useState(initial);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemberPicker value={value} onChange={setValue} disabled={disabled} />
      </QueryClientProvider>
    </I18nextProvider>
  );
}

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("MemberPicker", () => {
  it("offers only members not already on the product", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({
          items: [member("m1", "An Nguyen"), member("m2", "Binh Tran")],
          total: 2,
          page: 1,
          page_size: 100,
        }),
      ),
    );
    render(<Host initial={[draft("m1", "An Nguyen")]} />);

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("products.members.add") }),
    );
    expect(await screen.findByText("Binh Tran")).toBeInTheDocument();
    // "An Nguyen" is already in the list, so only the row shows it — not the menu.
    expect(screen.getAllByText("An Nguyen")).toHaveLength(1);
  });

  it("only asks the server for members shown on the site", async () => {
    // A hidden member would appear on a product page while absent from the
    // team page, which would be a contradiction.
    let query = "";
    server.use(
      http.get(`${API}/members`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 });
      }),
    );
    render(<Host />);
    await waitFor(() => expect(query).toContain("active=true"));
  });

  it("adds a member to the list", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({
          items: [member("m1", "An Nguyen", "Backend")],
          total: 1,
          page: 1,
          page_size: 100,
        }),
      ),
    );
    render(<Host />);

    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("products.members.add") }),
    );
    await userEvent.click(await screen.findByText("An Nguyen"));
    expect(await screen.findByTestId("product-member-row")).toBeInTheDocument();
  });

  it("shows the member's general role as the placeholder when no per-product role is set", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 }),
      ),
    );
    render(<Host initial={[draft("m1", "An Nguyen")]} />);

    const input = screen.getByLabelText(
      i18n.t("products.members.role_for", { name: "An Nguyen" }),
    );
    expect(input).toHaveAttribute("placeholder", "Backend Engineer");
    expect(input).toHaveValue("");
  });

  it("keeps a per-product role once typed", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 }),
      ),
    );
    render(<Host initial={[draft("m1", "An Nguyen")]} />);

    const input = screen.getByLabelText(
      i18n.t("products.members.role_for", { name: "An Nguyen" }),
    );
    await userEvent.type(input, "Thiết kế");
    expect(input).toHaveValue("Thiết kế");
  });

  it("removes a member", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 }),
      ),
    );
    render(<Host initial={[draft("m1", "An Nguyen")]} />);

    await userEvent.click(screen.getByRole("button", { name: i18n.t("common.remove") }));
    expect(screen.queryByTestId("product-member-row")).not.toBeInTheDocument();
  });

  it("hides add, remove and reorder when read-only", async () => {
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100 }),
      ),
    );
    render(<Host initial={[draft("m1", "An Nguyen")]} disabled />);

    expect(
      screen.queryByRole("button", { name: i18n.t("products.members.add") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.remove") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("products.members.reorder") }),
    ).not.toBeInTheDocument();
  });
});
