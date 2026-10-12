import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";
import { DEFAULT_PAGE_SIZE } from "@/utils/constants";
import type { Lead } from "../services/leads.service";
import LeadList from "./LeadList";

const t = (key: string) => i18n.t(key);
const lead: Lead = {
  id: "lead-1",
  name: "Khách kiểm thử",
  phone: "0901234567",
  email: "test@example.com",
  zalo: null,
  source: "chat",
  conversation_id: "conv-1",
  assignee: null,
  status: "qualified",
  note: "Cần trao đổi về triển khai",
  products: [{ id: "p1", slug: "inventory", name: "Quản lý kho" }],
  created_at: "2026-10-12T02:00:00Z",
  updated_at: "2026-10-12T02:00:00Z",
};

function mount(permissions = ["*"]) {
  useAuthStore.getState().setAuthz([], permissions);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LeadList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => useAuthStore.getState().clear());
const response = (url: URL, items: Lead[] = [lead], total = 42) => ({
  items,
  total,
  page: Number(url.searchParams.get("page") ?? 1),
  page_size: Number(url.searchParams.get("page_size") ?? DEFAULT_PAGE_SIZE),
});

describe("CRM lead workspace", () => {
  it("uses server-wide totals while displaying real contact channels and products", async () => {
    server.use(
      http.get("*/crm/leads", ({ request }) => {
        const url = new URL(request.url);
        const summary = url.searchParams.get("page_size") === "1";
        const counts: Record<string, number> = {
          "": 42,
          new: 7,
          qualified: 4,
          won: 3,
        };
        return HttpResponse.json(
          response(
            url,
            summary ? [] : [lead],
            summary ? counts[url.searchParams.get("status") ?? ""] : 42,
          ),
        );
      }),
    );
    mount();
    const table = await screen.findByTestId("leads-table");
    expect(within(table).getByText(lead.name!)).toBeVisible();
    expect(
      within(table).getByRole("link", { name: lead.phone! }),
    ).toHaveAttribute("href", "tel:0901234567");
    expect(
      within(table).getByRole("link", { name: lead.email! }),
    ).toHaveAttribute("href", "mailto:test@example.com");
    expect(within(table).getByText("Quản lý kho")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: new RegExp(t("leads.overview.new")),
        }),
      ).toHaveTextContent("7"),
    );
    expect(
      screen.getByRole("button", {
        name: new RegExp(t("leads.overview.total")),
      }),
    ).toHaveTextContent("42");
    expect(
      screen.getByRole("button", { name: new RegExp(t("leads.overview.won")) }),
    ).toHaveTextContent("3");
  });

  it("resets pagination for search, stage and owner filters", async () => {
    const requests: URL[] = [];
    server.use(
      http.get("*/crm/leads", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("page_size") !== "1") requests.push(url);
        return HttpResponse.json(response(url));
      }),
    );
    mount();
    await screen.findByTestId("leads-table");
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get("page")).toBe("2"),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: t("leads.search_label") }),
      { target: { value: " test " } },
    );
    fireEvent.submit(
      screen
        .getByRole("searchbox", { name: t("leads.search_label") })
        .closest("form")!,
    );
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get("q")).toBe("test");
      expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
    });
    fireEvent.click(
      within(
        screen.getByRole("group", { name: t("leads.filter_status") }),
      ).getByRole("button", { name: t("leads.status.new") }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: t("leads.col.assignee") }),
      { target: { value: "unassigned" } },
    );
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get("status")).toBe("new");
      expect(requests.at(-1)?.searchParams.get("assignee")).toBe("unassigned");
      expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(t("leads.overview.total")),
      }),
    );
    await waitFor(() => {
      expect(requests.at(-1)?.searchParams.get("q")).toBe("");
      expect(requests.at(-1)?.searchParams.get("status")).toBe("");
      expect(requests.at(-1)?.searchParams.get("assignee")).toBe("");
    });
    const search = screen.getByRole("searchbox", {
      name: t("leads.search_label"),
    });
    fireEvent.change(search, { target: { value: "test" } });
    fireEvent.submit(search.closest("form")!);
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get("q")).toBe("test"),
    );
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get("q")).toBe(""),
    );
  });

  it("distinguishes a filtered empty result from an empty customer base and clears all filters", async () => {
    server.use(
      http.get("*/crm/leads", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json(response(url, [], 0));
      }),
    );
    mount();
    expect(await screen.findByText(t("leads.empty_title"))).toBeVisible();
    fireEvent.change(
      screen.getByRole("combobox", { name: t("leads.col.source") }),
      { target: { value: "form" } },
    );
    expect(await screen.findByText(t("leads.no_results"))).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: t("leads.reset_filters") }),
    );
    expect(await screen.findByText(t("leads.empty_title"))).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: t("leads.col.source") }),
    ).toHaveValue("");
  });

  it("renders a read-only pipeline without management or chat controls when not permitted", async () => {
    server.use(
      http.get("*/crm/leads", ({ request }) =>
        HttpResponse.json(response(new URL(request.url))),
      ),
    );
    mount(["crm.leads.view_all"]);
    const table = await screen.findByTestId("leads-table");
    expect(within(table).getByText(t("leads.status.qualified"))).toBeVisible();
    expect(within(table).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(t("leads.open_chat"))).not.toBeInTheDocument();
  });

  it("updates status through the existing endpoint and refreshes the list", async () => {
    let current = lead;
    let payload: unknown;
    server.use(
      http.get("*/crm/leads", ({ request }) =>
        HttpResponse.json(response(new URL(request.url), [current])),
      ),
      http.patch("*/crm/leads/lead-1", async ({ request }) => {
        payload = await request.json();
        current = { ...lead, status: "won" };
        return HttpResponse.json(current);
      }),
    );
    mount();
    const table = await screen.findByTestId("leads-table");
    fireEvent.change(within(table).getByRole("combobox"), {
      target: { value: "won" },
    });
    await waitFor(() => expect(payload).toEqual({ status: "won" }));
    await waitFor(() =>
      expect(within(table).getByRole("combobox")).toHaveValue("won"),
    );
  });

  it("keeps deletion behind confirmation and does not delete on cancel", async () => {
    let deletes = 0;
    server.use(
      http.get("*/crm/leads", ({ request }) =>
        HttpResponse.json(response(new URL(request.url))),
      ),
      http.delete("*/crm/leads/lead-1", () => {
        deletes++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    mount();
    const table = await screen.findByTestId("leads-table");
    await user.click(
      within(table).getByRole("button", {
        name: i18n.t("leads.actions_for", { name: lead.name }),
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: t("common.delete") }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(deletes).toBe(0);
    await user.click(
      within(dialog).getByRole("button", { name: t("common.cancel") }),
    );
    expect(deletes).toBe(0);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows an error with retry without inventing zero totals", async () => {
    let failed = true;
    server.use(
      http.get("*/crm/leads", ({ request }) =>
        failed
          ? HttpResponse.json({ message: "Unavailable" }, { status: 400 })
          : HttpResponse.json(response(new URL(request.url))),
      ),
    );
    mount();
    expect(
      await screen.findByRole("button", { name: t("common.retry") }),
    ).toBeVisible();
    expect(screen.queryByText(t("leads.empty_title"))).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(t("leads.overview.total")),
      }),
    ).toHaveTextContent("—");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: t("common.retry") }));
    expect(await screen.findByTestId("leads-table")).toBeVisible();
  });
});
