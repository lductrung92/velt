// The site's only backend client.
//
// Almost everything else on this site is static content; the assistant and the
// newsletter opt-in are the two things that need a live server. Keeping them in
// one file makes the boundary obvious — and makes it obvious when something
// else starts reaching out.

const DEFAULT_BASE = "http://localhost:8081/api";

/** Base URL of the API. Build-time, so a deployment points it at its own host. */
export const apiBase: string =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  DEFAULT_BASE;

export type ConversationState = "bot" | "waiting" | "human" | "closed";
export type MessageRole = "visitor" | "assistant" | "staff" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface StartedConversation {
  id: string;
  state: ConversationState;
  /** The assistant is not answering (off, unconfigured, or over budget); the
   *  server still replies, with its scripted fallback. */
  degraded: boolean;
  greeting: string;
  referrer: { slug: string; full_name: string } | null;
}

/** Thrown with the server's error key so callers can react to a specific one
 *  (`no_staff_online`) without string-matching a message. */
export class ChatError extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
  ) {
    super(key);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiBase + path, {
    ...init,
    // The visitor cookie is what owns a conversation, so it has to ride along
    // on every call — including the SSE stream.
    credentials: "include",
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  });
  if (!res.ok) {
    let key = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) key = body.error.message;
    } catch {
      // A non-JSON error body is still an error; the status carries the meaning.
    }
    throw new ChatError(res.status, key);
  }
  return (await res.json()) as T;
}

export function startConversation(input: {
  ref?: string;
  page?: string;
}): Promise<StartedConversation> {
  return call<StartedConversation>("/public/chat/conversations", {
    method: "POST",
    body: JSON.stringify({ ref: input.ref ?? "", page: input.page ?? "" }),
  });
}

export function sendMessage(
  id: string,
  content: string,
): Promise<{ accepted: boolean; degraded: boolean }> {
  return call(`/public/chat/conversations/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function requestHuman(id: string): Promise<{ state: ConversationState }> {
  return call(`/public/chat/conversations/${id}/handoff`, { method: "POST" });
}

export function loadTranscript(id: string): Promise<{ items: ChatMessage[] }> {
  return call(`/public/chat/conversations/${id}`);
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onMessage: (message: ChatMessage) => void;
  onState: (state: ConversationState) => void;
}

/**
 * Opens the server-sent event stream and returns a close function.
 *
 * This is the ONLY channel text comes back on — the assistant's answer and a
 * member's reply arrive the same way, because on the server they are the same
 * conversation.
 */
export function openStream(id: string, handlers: StreamHandlers): () => void {
  const source = new EventSource(
    `${apiBase}/public/chat/conversations/${id}/stream`,
    { withCredentials: true },
  );

  const parse = <T,>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  source.addEventListener("delta", (e) => {
    const data = parse<{ text?: string }>((e as MessageEvent).data);
    if (data?.text) handlers.onDelta(data.text);
  });
  source.addEventListener("message", (e) => {
    const data = parse<{ message?: ChatMessage }>((e as MessageEvent).data);
    if (data?.message) handlers.onMessage(data.message);
  });
  source.addEventListener("state", (e) => {
    const data = parse<{ state?: ConversationState }>((e as MessageEvent).data);
    if (data?.state) handlers.onState(data.state);
  });

  return () => source.close();
}

/** Newsletter opt-in from the footer. The server rate-limits by IP and by
 *  address and answers 202 whether or not the address was already on the list,
 *  so the form cannot be used to find out who is subscribed. */
export function subscribeNewsletter(email: string): Promise<{ status: string }> {
  return call("/public/cms/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify({ email, source: "footer" }),
  });
}
