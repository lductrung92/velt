// The site's only backend client.
//
// Almost everything else on this site is static content; the assistant and the
// newsletter opt-in are the two things that need a live server. Keeping them in
// one file makes the boundary obvious — and makes it obvious when something
// else starts reaching out.

const DEFAULT_BASE = "http://localhost:8081/api";

/** Base URL of the API. Build-time, so a deployment points it at its own host. */
export const apiBase: string =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? DEFAULT_BASE;

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
  // 204 means "done, nothing to say", and res.json() on an empty body throws.
  // Treating that as a failure would report a successful write as a failed
  // one — which is exactly what it did for the contact form.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function startConversation(input: {
  ref?: string;
  page?: string;
  locale?: string;
  recaptchaToken?: string;
}): Promise<StartedConversation> {
  return call<StartedConversation>("/public/chat/conversations", {
    method: "POST",
    body: JSON.stringify({
      ref: input.ref ?? "",
      page: input.page ?? "",
      locale: input.locale ?? "",
      recaptcha_token: input.recaptchaToken ?? "",
    }),
  });
}

/**
 * The thread this visitor is already in, or null when there is none.
 *
 * Resolved from the server's own visitor cookie, so nothing about the
 * conversation is kept in the browser: no id in localStorage for a script to
 * read, nothing a visitor can edit to open somebody else's thread. A 404 is
 * the ordinary answer on a first visit, not a failure.
 */
export async function currentConversation(): Promise<StartedConversation | null> {
  try {
    return await call<StartedConversation>(
      "/public/chat/conversations/current",
    );
  } catch (err) {
    if (err instanceof ChatError && err.status === 404) return null;
    throw err;
  }
}

export function sendMessage(
  id: string,
  content: string,
  locale?: string,
): Promise<{ accepted: boolean; degraded: boolean }> {
  return call(`/public/chat/conversations/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, locale: locale ?? "" }),
  });
}

export function requestHuman(
  id: string,
): Promise<{ state: ConversationState }> {
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

  const parse = <T>(raw: string): T | null => {
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
export function subscribeNewsletter(
  email: string,
): Promise<{ status: string }> {
  return call("/public/cms/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify({ email, source: "footer" }),
  });
}

/** What the public contact form sends. The server decides source, status and
 *  everything else about how the lead is handled. */
export interface LeadSubmission {
  name: string;
  email: string;
  message: string;
  product_id?: string;
  ref?: string;
  recaptcha_token?: string;
}

/** Files a contact request. Throws on any refusal — the caller shows one
 *  message either way, so the distinctions stay on the server. */
export async function submitLead(body: LeadSubmission): Promise<void> {
  await call<void>("/public/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
