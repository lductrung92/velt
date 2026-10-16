import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";

import { PushDevicesDialog } from "./PushDevicesDialog";

const t = (key: string) => i18n.t(key);

const HERE = "https://push.example/here";
const ELSEWHERE = "https://push.example/elsewhere";

const devices = [
  {
    id: "device-here",
    endpoint: HERE,
    label: "Chrome · Windows",
    last_used_at: "2026-10-14T02:00:00Z",
    created_at: "2026-10-12T02:00:00Z",
  },
  {
    id: "device-away",
    endpoint: ELSEWHERE,
    label: "Firefox · macOS",
    last_used_at: null,
    created_at: "2026-10-13T02:00:00Z",
  },
];

/** jsdom has no push stack, so the browser side is stood up by hand. Without
 *  it the dialog correctly reports "unsupported" and nothing else can be
 *  tested. */
function fakeBrowser(subscribed: string | null) {
  const subscription = subscribed && {
    endpoint: subscribed,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
  };
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(subscription ?? null),
      subscribe: vi.fn().mockResolvedValue(subscription ?? null),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: Object.assign(function Notification() {}, {
      permission: "granted" as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue("granted"),
    }),
  });
  return { registration, subscription };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PushDevicesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.get("*/notify/push/devices", () =>
      HttpResponse.json({ items: devices }),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  // defineProperty survives restoreAllMocks, and a leftover push stack would
  // make the "unsupported" case silently untestable.
  for (const key of ["serviceWorker"] as const)
    Reflect.deleteProperty(navigator, key);
  for (const key of ["PushManager", "Notification"] as const)
    Reflect.deleteProperty(window, key);
});

describe("Push devices dialog", () => {
  it("marks the browser it is running in, and only that one", async () => {
    // The only thing that distinguishes one row from another is the endpoint,
    // so a wrong match here would offer to turn off somebody's other machine.
    fakeBrowser(HERE);
    mount();

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(t("chat.push.this_device"));
    expect(rows[1]).not.toHaveTextContent(t("chat.push.this_device"));
    expect(rows[1]).toHaveTextContent(t("chat.push.never_used"));
  });

  it("offers to turn notifications on when this browser is not signed up", async () => {
    fakeBrowser(null);
    mount();

    expect(await screen.findByText(t("chat.push.off_here"))).toBeVisible();
    expect(
      screen.getByRole("button", { name: t("chat.push.enable") }),
    ).toBeVisible();
  });

  it("hides the offer once this browser is signed up", async () => {
    fakeBrowser(HERE);
    mount();

    await screen.findAllByRole("listitem");
    expect(
      screen.queryByRole("button", { name: t("chat.push.enable") }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(t("chat.push.off_here"))).not.toBeInTheDocument();
  });

  it("drops this browser's own subscription when its row is removed", async () => {
    // Deleting the row alone leaves the push service holding a live
    // subscription, which a later re-subscribe silently restores.
    const { subscription } = fakeBrowser(HERE);
    let deleted = "";
    server.use(
      http.delete("*/notify/push/devices/:id", ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    mount();

    const rows = await screen.findAllByRole("listitem");
    fireEvent.click(within(rows[0]).getByRole("button"));

    await waitFor(() => expect(deleted).toBe("device-here"));
    expect(subscription && subscription.unsubscribe).toHaveBeenCalled();
  });

  it("leaves this browser subscribed when another device is removed", async () => {
    const { subscription } = fakeBrowser(HERE);
    server.use(
      http.delete(
        "*/notify/push/devices/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    mount();

    const rows = await screen.findAllByRole("listitem");
    fireEvent.click(within(rows[1]).getByRole("button"));

    await waitFor(() =>
      expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0),
    );
    expect(subscription && subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("says so plainly when the browser cannot do push at all", async () => {
    mount();
    expect(await screen.findByText(t("chat.push.unsupported"))).toBeVisible();
  });
});
