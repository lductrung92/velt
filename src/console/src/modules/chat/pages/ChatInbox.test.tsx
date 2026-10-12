import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/app/i18n";
import { server } from "@/test/server";
import type { InboxItem } from "../services/chat.service";
import ChatInbox from "./ChatInbox";

const t = (key: string) => i18n.t(key);
const first: InboxItem = {
  id: "conversation-abc123",
  state: "waiting",
  claimed_by_user_id: null,
  lead_id: null,
  last_message: "Tôi cần một website bán hàng",
  last_role: "visitor",
  message_count: 2,
  last_activity_at: "2026-10-12T03:30:00Z",
  created_at: "2026-10-12T03:00:00Z",
};
const second: InboxItem = {
  ...first,
  id: "conversation-def456",
  state: "human",
  last_message: "Tư vấn sản phẩm",
};
const messages = [
  {
    id: "m1",
    role: "visitor",
    content: "Xin chào, tôi cần tư vấn.\nTeam có sản phẩm nào?",
    created_at: first.created_at,
  },
  {
    id: "m2",
    role: "assistant",
    content: "Chào bạn, mình có thể hỗ trợ.",
    created_at: first.last_activity_at,
  },
];

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChatInbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.post("*/chat/presence", () => HttpResponse.json({ online: 1 })),
    http.get("*/chat/conversations/:id", () =>
      HttpResponse.json({ items: messages }),
    ),
  );
});

describe("Chat inbox workspace", () => {
  it("shows a useful empty state without invented conversations", async () => {
    server.use(
      http.get("*/chat/conversations", () => HttpResponse.json({ items: [] })),
    );
    mount();
    expect(await screen.findByText(t("chat.empty"))).toBeVisible();
    expect(screen.getByText(t("chat.empty_hint"))).toBeVisible();
    expect(screen.getByText(t("chat.welcome_title"))).toBeVisible();
    expect(screen.queryAllByTestId("chat-inbox-row")).toHaveLength(0);
    expect(
      screen.queryByRole("textbox", { name: t("chat.reply_ph") }),
    ).not.toBeInTheDocument();
  });

  it("searches conversations and queries the selected state including closed history", async () => {
    let requested = "";
    server.use(
      http.get("*/chat/conversations", ({ request }) => {
        requested = new URL(request.url).searchParams.get("state") ?? "";
        return HttpResponse.json({
          items:
            requested === "closed"
              ? [{ ...first, state: "closed" }]
              : [first, second],
        });
      }),
    );
    mount();
    expect(await screen.findAllByTestId("chat-inbox-row")).toHaveLength(2);
    fireEvent.change(
      screen.getByRole("textbox", { name: t("chat.search_label") }),
      { target: { value: "bán hàng" } },
    );
    expect(screen.getAllByTestId("chat-inbox-row")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: t("chat.clear_search") }),
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: t("chat.filter_label") }),
      ).getByRole("button", { name: t("chat.filter.closed") }),
    );
    await waitFor(() => expect(requested).toBe("closed"));
    fireEvent.click((await screen.findAllByTestId("chat-inbox-row"))[0]);
    expect(await screen.findByText(t("chat.closed_notice"))).toBeVisible();
    expect(
      screen.queryByRole("button", { name: t("chat.send") }),
    ).not.toBeInTheDocument();
  });

  it("keeps drafts separate and only sends to the active conversation", async () => {
    const sent: Array<{ id: string; content: unknown }> = [];
    server.use(
      http.get("*/chat/conversations", () =>
        HttpResponse.json({ items: [first, second] }),
      ),
      http.post(
        "*/chat/conversations/:id/messages",
        async ({ request, params }) => {
          const body = (await request.json()) as { content: string };
          sent.push({ id: String(params.id), content: body.content });
          return HttpResponse.json({
            ...messages[0],
            id: "reply",
            role: "staff",
            content: body.content,
          });
        },
      ),
    );
    mount();
    const rows = await screen.findAllByTestId("chat-inbox-row");
    fireEvent.click(rows[0]);
    const editor = screen.getByRole("textbox", { name: t("chat.reply_ph") });
    fireEvent.change(editor, { target: { value: "Bản nháp cho khách A" } });
    fireEvent.click(rows[1]);
    expect(editor).toHaveValue("");
    fireEvent.change(editor, { target: { value: "Khách B" } });
    fireEvent.click(rows[0]);
    expect(editor).toHaveValue("Bản nháp cho khách A");
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
    expect(sent).toHaveLength(0);
    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() =>
      expect(sent).toEqual([{ id: first.id, content: "Bản nháp cho khách A" }]),
    );
    await waitFor(() => expect(editor).toHaveValue(""));
    fireEvent.click(rows[1]);
    expect(editor).toHaveValue("Khách B");
  });

  it("preserves the selected transcript after ending a chat removes it from the live queue", async () => {
    let closed = false;
    server.use(
      http.get("*/chat/conversations", () =>
        HttpResponse.json({ items: closed ? [] : [first] }),
      ),
      http.post("*/chat/conversations/:id/close", () => {
        closed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    mount();
    fireEvent.click(await screen.findByTestId("chat-inbox-row"));
    expect(await screen.findByText(messages[1].content)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: t("chat.close") }));
    expect(await screen.findByText(t("chat.closed_notice"))).toBeVisible();
    await waitFor(() =>
      expect(screen.queryAllByTestId("chat-inbox-row")).toHaveLength(0),
    );
    expect(screen.getByText(messages[1].content)).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: t("chat.reply_ph") }),
    ).not.toBeInTheDocument();
  });

  it("shows transcript errors with retry instead of presenting an empty conversation", async () => {
    let broken = true;
    server.use(
      http.get("*/chat/conversations", () =>
        HttpResponse.json({ items: [first] }),
      ),
      http.get("*/chat/conversations/:id", () =>
        broken
          ? HttpResponse.json({ message: "Unavailable" }, { status: 400 })
          : HttpResponse.json({ items: messages }),
      ),
    );
    mount();
    fireEvent.click(await screen.findByTestId("chat-inbox-row"));
    const retry = await screen.findByRole("button", {
      name: t("common.retry"),
    });
    expect(screen.queryByText(t("chat.no_messages"))).not.toBeInTheDocument();
    broken = false;
    fireEvent.click(retry);
    expect(await screen.findByText(messages[1].content)).toBeVisible();
  });
});
