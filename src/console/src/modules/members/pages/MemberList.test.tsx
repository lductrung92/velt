import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";

import MemberList from "./MemberList";

const API = "http://localhost/api";

function member(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    slug: "an-nguyen",
    full_name: "An Nguyễn",
    role: "Backend Engineer",
    bio: null,
    avatar_url: null,
    email: null,
    zalo: null,
    links: [],
    skills: ["Go"],
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function page(items: unknown[]) {
  return { items, total: items.length, page: 1, page_size: 100 };
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setSession(
    {
      id: "admin-1",
      email: "admin@velt.local",
      full_name: "Admin",
      avatar_url: null,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: null,
    },
    "tok",
  );
  useAuthStore.getState().setAuthz(["admin"], permissions);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/members"]}>
          <MemberList />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const MANAGER = ["members.view", "members.manage"];
const VIEWER = ["members.view"];

beforeEach(() => useAuthStore.getState().clear());
afterEach(() => useAuthStore.getState().clear());

describe("MemberList", () => {
  it("lists members with name, role and skills", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json(
          page([
            member(),
            member({
              id: "m2",
              full_name: "Bình Trần",
              slug: "binh-tran",
              role: "Thiết kế",
              skills: ["Figma"],
            }),
          ]),
        ),
      ),
    );
    renderPage();

    const table = within(await screen.findByTestId("members-table"));
    expect(table.getByText("An Nguyễn")).toBeInTheDocument();
    expect(table.getByText("Backend Engineer")).toBeInTheDocument();
    expect(table.getByText("Go")).toBeInTheDocument();
    expect(table.getByText("Bình Trần")).toBeInTheDocument();
  });

  it("repeats every row as a card, so a narrow column keeps its actions", async () => {
    // Below 960px of panel width the table is hidden and these cards are the
    // only list; a row action that lives solely in the table is unreachable.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () => HttpResponse.json(page([member()]))),
    );
    renderPage();

    const cards = within(await screen.findByTestId("members-cards"));
    expect(cards.getByText("An Nguyễn")).toBeInTheDocument();
    expect(
      cards.getByRole("button", { name: i18n.t("common.edit") }),
    ).toBeInTheDocument();
    expect(
      cards.getByRole("button", { name: i18n.t("common.delete") }),
    ).toBeInTheDocument();
  });

  it("labels a hidden member instead of dropping it from the list", async () => {
    // The console is where you go to un-hide someone, so they must stay visible
    // here even though the public site no longer shows them.
    signIn(VIEWER);
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json(page([member({ is_active: false })])),
      ),
    );
    renderPage();

    const table = within(await screen.findByTestId("members-table"));
    expect(table.getByText("An Nguyễn")).toBeInTheDocument();
    expect(table.getByText(i18n.t("members.hidden"))).toBeInTheDocument();
  });

  it("hides create and delete from a viewer without members.manage", async () => {
    signIn(VIEWER);
    server.use(
      http.get(`${API}/members`, () => HttpResponse.json(page([member()]))),
    );
    renderPage();

    await screen.findByTestId("members-table");
    expect(
      screen.queryByRole("button", { name: i18n.t("members.create") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("common.delete") }),
    ).not.toBeInTheDocument();
  });

  it("shows create and delete to a manager", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () => HttpResponse.json(page([member()]))),
    );
    renderPage();

    const table = within(await screen.findByTestId("members-table"));
    expect(
      screen.getByRole("button", { name: i18n.t("members.create") }),
    ).toBeInTheDocument();
    expect(
      table.getByRole("button", { name: i18n.t("common.delete") }),
    ).toBeInTheDocument();
  });

  it("offers a way in from an empty roster, not just a bare no-data row", async () => {
    // An empty roster is the first thing a new install shows, so it has to say
    // what the screen is for and hand over the create action.
    signIn(MANAGER);
    server.use(http.get(`${API}/members`, () => HttpResponse.json(page([]))));
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: i18n.t("members.empty_title"),
      }),
    ).toBeInTheDocument();
    // Two create buttons: the panel heading and the empty state's own call to
    // action. The second one is the point of this test.
    expect(
      screen.getAllByRole("button", { name: i18n.t("members.create") }),
    ).toHaveLength(2);
    expect(screen.queryByTestId("members-table")).not.toBeInTheDocument();
  });

  it("filters by the search term", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json(
          page([
            member(),
            member({ id: "m2", full_name: "Bình Trần", slug: "binh-tran", role: "Thiết kế" }),
          ]),
        ),
      ),
    );
    renderPage();

    await screen.findAllByTestId("member-row");
    await userEvent.type(
      screen.getByRole("searchbox", { name: i18n.t("members.search_label") }),
      "Thiết kế",
    );

    const rows = screen.getAllByTestId("member-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Bình Trần");
  });

  it("hides the drag handle while the list is filtered or sorted", async () => {
    // Reordering a subset would write an order the user never chose, and that
    // order is what the public team page renders.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json(page([member(), member({ id: "m2", full_name: "Bình Trần" })])),
      ),
    );
    renderPage();

    await screen.findAllByTestId("member-row");
    expect(
      screen.getAllByRole("button", { name: i18n.t("members.reorder") }),
    ).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: /Thành viên/ }));
    expect(
      screen.queryByRole("button", { name: i18n.t("members.reorder") }),
    ).not.toBeInTheDocument();
  });

  it("sorts by a column in both directions, not just ascending", async () => {
    // The header speaks the API convention ("role" asc, "-role" desc). Parsing
    // it as "col:dir" left every second click sorting ascending again, and sent
    // "-role" down the name branch — so descending silently did nothing and the
    // role column silently sorted by name.
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () =>
        HttpResponse.json(
          page([
            member({ id: "m1", full_name: "Bình Trần", role: "Designer" }),
            member({ id: "m2", full_name: "An Nguyễn", role: "QA Engineer" }),
            member({ id: "m3", full_name: "Cường Lê", role: "Backend" }),
          ]),
        ),
      ),
    );
    renderPage();
    await screen.findAllByTestId("member-row");

    // Row text leads with the avatar initials, so match on the name itself.
    const order = (names: string[]) =>
      screen
        .getAllByTestId("member-row")
        .map((r) => names.find((n) => (r.textContent ?? "").includes(n)) ?? "?");
    const byName = () => order(["An Nguyễn", "Bình Trần", "Cường Lê"]);
    const byRole = () => order(["Backend", "Designer", "QA Engineer"]);
    const nameHead = screen.getByRole("button", { name: /Thành viên/ });
    const roleHead = screen.getByRole("button", { name: /Vai trò/ });

    await userEvent.click(nameHead);
    expect(byName()).toEqual(["An Nguyễn", "Bình Trần", "Cường Lê"]);

    await userEvent.click(nameHead); // second click must reverse it
    expect(byName()).toEqual(["Cường Lê", "Bình Trần", "An Nguyễn"]);

    await userEvent.click(roleHead);
    expect(byRole()).toEqual(["Backend", "Designer", "QA Engineer"]);

    await userEvent.click(roleHead); // descending BY ROLE, not by name
    expect(byRole()).toEqual(["QA Engineer", "Designer", "Backend"]);
  });

  it("warns that deleting unlinks the member from every product", async () => {
    signIn(MANAGER);
    server.use(
      http.get(`${API}/members`, () => HttpResponse.json(page([member()]))),
    );
    renderPage();

    const table = within(await screen.findByTestId("members-table"));
    await userEvent.click(
      table.getByRole("button", { name: i18n.t("common.delete") }),
    );

    expect(
      await screen.findByText(i18n.t("members.delete.title")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        i18n.t("members.delete.description", { name: "An Nguyễn" }),
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a load failure instead of an empty roster", async () => {
    signIn(VIEWER);
    server.use(
      // 403, not 500: axios-retry re-sends 5xx three times with exponential
      // backoff, which outlives the assertion budget.
      http.get(`${API}/members`, () =>
        HttpResponse.json(
          { error: { code: 403, message: "access_denied", details: null } },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    // An error must not look like an empty roster.
    await waitFor(() =>
      expect(screen.queryByTestId("members-table")).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

});
