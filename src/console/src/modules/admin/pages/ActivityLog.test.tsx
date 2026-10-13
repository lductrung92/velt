import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { useAuthStore } from "@/store/auth.store";
import { server } from "@/test/server";
import { DEFAULT_PAGE_SIZE } from "@/utils/constants";

import type { ActivityEntry } from "../services/activity.service";
import ActivityLog from "./ActivityLog";

const t = (key: string) => i18n.t(key);

// The screen formats instants in the viewer's own locale and timezone, so the
// expected string is derived the same way rather than hardcoded.
const exact = (iso: string) =>
  new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(iso));

// Fixed so "2 hours ago" is a fact, not a race with the clock.
const NOW = new Date("2026-10-13T12:00:00Z");

const base: ActivityEntry = {
  id: 1,
  occurred_at: "2026-10-13T10:00:00Z",
  action: "article.published",
  entity: "article",
  entity_id: "11111111-1111-1111-1111-111111111111",
  entity_label: "Ra mat VELT",
  actor_id: "22222222-2222-2222-2222-222222222222",
  actor_label: "Nguyen Van A",
  ip: "10.0.0.1",
  correlation_id: "corr-1",
  metadata: {},
};

function mount() {
  useAuthStore.getState().setAuthz([], ["*"]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityLog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Every test serves the same two endpoints; `captured` is what the screen
// actually asked the API for.
let captured: URLSearchParams | null = null;
function serve(items: ActivityEntry[], total = items.length, extra = {}) {
  server.use(
    http.get("*/activity/actions", () =>
      HttpResponse.json({ items: ["article.published", "velt.unlabelled"] }),
    ),
    http.get("*/activity", ({ request }) => {
      const url = new URL(request.url);
      captured = url.searchParams;
      return HttpResponse.json({
        items,
        total,
        page: Number(url.searchParams.get("page") ?? 1),
        page_size: Number(
          url.searchParams.get("page_size") ?? DEFAULT_PAGE_SIZE,
        ),
        ...extra,
      });
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  captured = null;
});
afterEach(() => {
  vi.useRealTimers();
  useAuthStore.getState().clear();
});

describe("Activity log", () => {
  it("answers who did what to what and when, with both clocks", async () => {
    serve([base]);
    mount();

    const table = await screen.findByTestId("activity-table");
    const row = within(table).getByTestId("activity-row");
    expect(within(row).getByText("Nguyen Van A")).toBeVisible();
    expect(within(row).getByText("Ra mat VELT")).toBeVisible();
    expect(
      within(row).getByText(t("activity.action.article.published")),
    ).toBeVisible();

    // Relative to judge recency; the exact instant is on the page too, because
    // an audit answer gets pasted into a ticket.
    const when = row.querySelector("time");
    expect(when).toHaveAttribute("dateTime", base.occurred_at);
    expect(when?.textContent).toMatch(/2/); // "2 hours ago" / "2 giờ trước"
    expect(within(row).getByText(exact(base.occurred_at))).toBeVisible();
  });

  it("shows the raw code when nobody has written a label for it", async () => {
    // Codes ship with the module that writes them; labels follow later. An
    // unlabelled action must still name itself rather than leave a blank cell.
    serve([{ ...base, id: 2, action: "velt.unlabelled" }]);
    mount();

    const row = within(await screen.findByTestId("activity-table")).getByTestId(
      "activity-row",
    );
    expect(within(row).getByText("velt.unlabelled")).toBeVisible();
  });

  it("names a deleted actor and a deleted record from the row itself", async () => {
    // No join: the labels are snapshots, and a system action has no actor at
    // all. Both must still read as something.
    serve([
      {
        ...base,
        id: 3,
        actor_id: null,
        actor_label: "system",
        entity: null,
        entity_id: null,
        entity_label: null,
      },
    ]);
    mount();

    const row = within(await screen.findByTestId("activity-table")).getByTestId(
      "activity-row",
    );
    expect(within(row).getByText("system")).toBeVisible();
    expect(within(row).getByText(t("activity.no_target"))).toBeVisible();
  });

  it("filters by the indexed columns and pages through the result", async () => {
    const user = userEvent.setup();
    serve([base], 42);
    mount();
    await screen.findByTestId("activity-table");

    // Free text is submitted, not typed-and-fetched: every keystroke would be
    // an unindexed scan.
    await user.type(
      screen.getByRole("searchbox", { name: t("activity.search_label") }),
      "nguyen",
    );
    await user.click(
      screen.getByRole("button", { name: t("activity.apply_search") }),
    );
    await waitFor(() => expect(captured?.get("q")).toBe("nguyen"));

    // The cells are rendered twice — desktop table and mobile cards — so a
    // click has to say which one it means.
    const inTable = (name: RegExp) =>
      within(screen.getByTestId("activity-table")).getByRole("button", {
        name,
      });

    // Clicking the actor narrows to actor_id — the exact id, on its own index.
    await user.click(inTable(/Nguyen Van A/));
    await waitFor(() => expect(captured?.get("actor_id")).toBe(base.actor_id));
    expect(captured?.get("page")).toBe("1");

    // Clicking the target narrows to entity + entity_id, likewise paired.
    await user.click(inTable(/Ra mat VELT/));
    await waitFor(() => {
      expect(captured?.get("entity")).toBe("article");
      expect(captured?.get("entity_id")).toBe(base.entity_id);
    });

    await user.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(captured?.get("page")).toBe("2"));

    // Clearing puts every filter back, including the page.
    await user.click(
      screen.getByRole("button", { name: t("common.clear_all") }),
    );
    await waitFor(() => {
      expect(captured?.get("q")).toBeNull();
      expect(captured?.get("actor_id")).toBeNull();
      expect(captured?.get("entity_id")).toBeNull();
      expect(captured?.get("page")).toBe("1");
    });
  });

  it("offers the action codes the log actually holds", async () => {
    const user = userEvent.setup();
    serve([base]);
    mount();
    await screen.findByTestId("activity-table");

    await user.click(
      screen.getByRole("combobox", { name: t("activity.col.action") }),
    );
    // Labelled and unlabelled codes both appear — the list comes from the data,
    // not from a hardcoded menu that drifts.
    await user.click(
      await screen.findByRole("option", {
        name: t("activity.action.article.published"),
      }),
    );
    await waitFor(() =>
      expect(captured?.get("action")).toBe("article.published"),
    );
  });

  it("says when a search was clamped instead of implying it saw everything", async () => {
    const since = "2026-07-15T12:00:00Z";
    serve([base], 1, { search_from: since });
    mount();
    await screen.findByTestId("activity-table");
    expect(
      await screen.findByText(
        t("activity.search_window").replace("{{since}}", exact(since)),
      ),
    ).toBeVisible();
  });
});
