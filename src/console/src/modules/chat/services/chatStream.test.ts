import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth.store";

import { openInboxStream, type InboxEvent } from "./chatStream";

/** Serves the given chunks as a response body, then ends the stream. */
function serve(chunks: string[]) {
  const encoder = new TextEncoder();
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  });
}

/** Waits until `read` stops changing, so a test cannot pass on a half-parsed
 *  stream. */
async function settle(read: () => number) {
  for (let i = 0; i < 100; i += 1) {
    const before = read();
    await new Promise((r) => setTimeout(r, 5));
    if (read() === before && before > 0) return;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ accessToken: null });
});

describe("Inbox stream reader", () => {
  it("reads events whose frames are split across reads", async () => {
    // The failure this guards: a chunk boundary in the middle of a frame.
    // Parsing each read on its own loses the event and, worse, loses it
    // silently — the queue just stops moving.
    useAuthStore.setState({ accessToken: "t" });
    vi.stubGlobal(
      "fetch",
      serve([
        'event: inbox\ndata: {"type":"inbox","conversation_i',
        'd":"abc"}\n\nevent: inbox\ndata: {"type":"inbox","conversation_id":"def"}\n\n',
      ]),
    );

    const seen: InboxEvent[] = [];
    const stop = openInboxStream((e) => seen.push(e));
    await settle(() => seen.length);
    stop();

    expect(seen).toEqual([
      { type: "inbox", conversation_id: "abc" },
      { type: "inbox", conversation_id: "def" },
    ]);
  });

  it("ignores keep-alive comments and unreadable frames", async () => {
    // A ping carries no data line, and a truncated payload is not worth
    // tearing the connection down for.
    useAuthStore.setState({ accessToken: "t" });
    vi.stubGlobal(
      "fetch",
      serve([
        ": ping\n\n",
        "event: inbox\ndata: {oops\n\n",
        'event: inbox\ndata: {"type":"inbox","conversation_id":"ok"}\n\n',
      ]),
    );

    const seen: InboxEvent[] = [];
    const stop = openInboxStream((e) => seen.push(e));
    await settle(() => seen.length);
    stop();

    expect(seen).toEqual([{ type: "inbox", conversation_id: "ok" }]);
  });

  it("does not call the endpoint when nobody is signed in", async () => {
    const fetchMock = serve([]);
    vi.stubGlobal("fetch", fetchMock);

    const stop = openInboxStream(() => {});
    await new Promise((r) => setTimeout(r, 30));
    stop();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops for good once the caller says so", async () => {
    // The reconnect loop is the part that can outlive the screen; an operator
    // leaving the inbox must not leave a connection reopening behind them.
    useAuthStore.setState({ accessToken: "t" });
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const stop = openInboxStream(() => {});
    await new Promise((r) => setTimeout(r, 30));
    stop();
    const calls = fetchMock.mock.calls.length;

    await new Promise((r) => setTimeout(r, 1200));
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
