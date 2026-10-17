import { useCallback, useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import {
  ChatError,
  currentConversation,
  loadTranscript,
  openStream,
  sendMessage,
  startConversation,
  type ChatMessage,
  type ConversationState,
} from "../lib/chatApi";
import type { MessageKey, T } from "../lib/i18n";
import { recaptchaToken } from "../lib/recaptcha";
import { Icon } from "./Icon";
import { RichText } from "./RichText";

// The assistant, wired to the real backend.
//
// There is ONE conversation, not a bot channel and a staff channel: on the
// server a member joins the visitor's existing thread, and the `state` field
// says who is speaking. Two tabs over one thread would have been a lie about
// the data model — and the old "no staff are here" copy becomes false the
// moment handoff works.

const SUGGESTIONS: MessageKey[] = [
  "chat.suggestion_team",
  "chat.suggestion_trial",
  "chat.suggestion_human",
];

/** What the label above a bubble says. `staff` is a real person answering, and
 *  the visitor should be able to tell. */
function speaker(t: T, role: ChatMessage["role"], degraded: boolean): string {
  switch (role) {
    case "visitor":
      return t("chat.speaker_visitor");
    case "staff":
      return t("chat.speaker_staff");
    case "system":
      return t("chat.speaker_system");
    default:
      return t(
        degraded ? "chat.speaker_assistant_short" : "chat.speaker_assistant",
      );
  }
}

export function Chat() {
  const { referrer, url, locale, layout, t } = useSite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [state, setState] = useState<ConversationState>("bot");
  const [degraded, setDegraded] = useState(false);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const conversationId = useRef<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const attach = useCallback((id: string) => {
    closeStream.current?.();
    closeStream.current = openStream(id, {
      onDelta: (text) => setStreaming((cur) => cur + text),
      onMessage: (message) => {
        // The finished message replaces whatever was streamed: the server's
        // stored copy is the one that survives a reload.
        setStreaming("");
        setMessages((cur) =>
          cur.some((m) => m.id === message.id) ? cur : [...cur, message],
        );
      },
      onState: setState,
    });
  }, []);

  // Opening the widget RESUMES a conversation; it never creates one.
  //
  // Creating on open meant a visitor who opened the chat and read the greeting
  // left a row behind and showed up in the console queue without ever having
  // said anything. Now nothing is written until they write — see submit().
  //
  // Resuming is a lookup by the server's own visitor cookie, so the thread
  // survives a reload with nothing stored in the browser: no id in
  // localStorage for a script to read, and nothing the visitor can edit to
  // open somebody else's conversation.
  const resumed = useRef(false);
  useEffect(() => {
    if (!open || conversationId.current || resumed.current) return;
    resumed.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const existing = await currentConversation();
        // No thread yet is the ordinary first visit: the local greeting is
        // already on screen and there is nothing else to do.
        if (!existing || cancelled) return;
        conversationId.current = existing.id;
        setState(existing.state);
        setDegraded(existing.degraded);
        const { items } = await loadTranscript(existing.id);
        if (cancelled) return;
        setMessages(items);
        attach(existing.id);
      } catch {
        // A failed resume must not block a new conversation, so this is not
        // surfaced: the visitor can still type, and submit() will start one.
        if (!cancelled) resumed.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, attach]);

  // Close the stream when the widget is unmounted, not when it is minimised:
  // a visitor who reopens should still catch a reply that arrived meanwhile.
  useEffect(() => () => closeStream.current?.(), []);

  useEffect(() => {
    if (!open) return;
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(input.current.scrollHeight, 96)}px`;
    }
  }, [open, draft, messages, streaming]);

  const toggle = useCallback((value: boolean, restoreFocus = false) => {
    setOpen(value);
    requestAnimationFrame(() => {
      if (value) {
        if (matchMedia("(min-width:768px)").matches)
          input.current?.focus({ preventScroll: true });
        else closeButton.current?.focus({ preventScroll: true });
      } else if (restoreFocus) launcher.current?.focus({ preventScroll: true });
    });
  }, []);

  async function submit(text: string) {
    const message = text.trim().slice(0, 2000);
    if (!message || sending) return;

    setDraft("");
    setSending(true);
    setNotice("");
    try {
      let id = conversationId.current;
      // First message of the visit: this is where the conversation is born.
      // Everything before now — opening the widget, reading the greeting —
      // left no trace on the server.
      if (!id) {
        // Only here, never on later messages: a challenge per message would
        // make the chat unusable, and the cost of abuse is in opening threads.
        // The API decides whether the token was required; an empty one simply
        // gets refused rather than waved through.
        const token =
          layout.head.chatRequiresCaptcha && layout.head.recaptchaSiteKey
            ? await recaptchaToken(layout.head.recaptchaSiteKey)
            : "";
        const started = await startConversation({
          ref: referrer?.id ? (url.searchParams.get("ref") ?? "") : "",
          page: url.pathname,
          locale,
          recaptchaToken: token || undefined,
        });
        id = started.id;
        conversationId.current = id;
        setState(started.state);
        setDegraded(started.degraded);
        // The server persisted its own greeting as the first message. Loading
        // it now swaps the local bubble for the stored one; the two carry the
        // same wording, so nothing on screen appears to change.
        const { items } = await loadTranscript(id);
        setMessages(items);
        attach(id);
      }
      const res = await sendMessage(id, message, locale);
      setDegraded(res.degraded);
    } catch (err) {
      setNotice(
        t(
          err instanceof ChatError && err.key === "turn_limit_reached"
            ? "chat.error_turn_limit"
            : "chat.error_send",
        ),
      );
    } finally {
      setSending(false);
      input.current?.focus({ preventScroll: true });
    }
  }

  const waiting = state === "waiting";
  const withHuman = state === "human";

  return (
    <div
      className="chat-widget"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          toggle(false, true);
        }
      }}
    >
      <section
        className="chat-panel"
        id="zukatek-chat"
        role="dialog"
        aria-labelledby="chat-title"
        hidden={!open}
      >
        <header className="chat-header">
          <span className="chat-brand-icon">
            <Icon name="chat" />
          </span>
          <div className="chat-header-copy">
            <h2 id="chat-title">{t("chat.title")}</h2>
            <p>
              {t(
                withHuman
                  ? "chat.status_human"
                  : waiting
                    ? "chat.status_waiting"
                    : "chat.status_bot",
              )}
            </p>
          </div>
          <button
            ref={closeButton}
            className="chat-close"
            type="button"
            aria-label={t("chat.minimize")}
            onClick={() => toggle(false, true)}
          >
            <Icon name="close" />
          </button>
        </header>

        {degraded && (
          <div className="chat-preview-note">
            <span>{t("chat.degraded_badge")}</span>
            <p>{t("chat.degraded_note")}</p>
          </div>
        )}

        <div className="chat-conversation" id="chat-conversation">
          <div
            ref={log}
            className="chat-messages"
            role="log"
            aria-label={t("chat.log_label")}
            aria-live="polite"
            aria-relevant="additions"
          >
            {/* The opening line, rendered locally. It is not a message from
                the server and no request produced it, which is the point: a
                visitor who opens the chat and reads this costs nothing and
                leaves nothing behind. It is replaced by the stored transcript
                the moment they write. */}
            {messages.length === 0 && (
              <div className="chat-message chat-message-assistant">
                <span className="chat-message-avatar">
                  <Icon name="spark" />
                </span>
                <div className="chat-message-body">
                  <span className="chat-message-label">
                    {speaker(t, "assistant", degraded)}
                  </span>
                  <div className="chat-bubble">
                    {referrer?.name
                      ? t("chat.greeting_referred", { name: referrer.name })
                      : t("chat.greeting")}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                className={`chat-message chat-message-${
                  message.role === "visitor" ? "user" : "assistant"
                }`}
                key={message.id}
              >
                {message.role !== "visitor" && (
                  <span className="chat-message-avatar">
                    <Icon
                      name={message.role === "staff" ? "support" : "spark"}
                    />
                  </span>
                )}
                <div className="chat-message-body">
                  <span className="chat-message-label">
                    {speaker(t, message.role, degraded)}
                  </span>
                  <div className="chat-bubble">
                    {message.role === "visitor" ? (
                      message.content
                    ) : (
                      // Only the assistant writes Markdown. A visitor's own
                      // words are shown exactly as typed — nobody expects
                      // their asterisks to vanish.
                      <RichText text={message.content} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* The answer as it arrives, before the server's stored copy lands. */}
            {streaming && (
              <div className="chat-message chat-message-assistant">
                <span className="chat-message-avatar">
                  <Icon name="spark" />
                </span>
                <div className="chat-message-body">
                  <span className="chat-message-label">
                    {speaker(t, "assistant", degraded)}
                  </span>
                  <div className="chat-bubble">{streaming}</div>
                </div>
              </div>
            )}
          </div>

          <div
            className="chat-suggestions"
            aria-label={t("chat.suggestions_label")}
          >
            {messages.length <= 1 &&
              SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={sending}
                  onClick={() => void submit(t(key))}
                >
                  {t(key)}
                </button>
              ))}
          </div>
        </div>

        {notice && (
          <div className="chat-handoff" role="status">
            <p>{notice}</p>
          </div>
        )}

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <label className="sr-only" htmlFor="chat-input">
            {t("chat.input_label")}
          </label>
          <textarea
            ref={input}
            id="chat-input"
            rows={1}
            maxLength={2000}
            placeholder={t(
              withHuman ? "chat.placeholder_human" : "chat.placeholder_bot",
            )}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit(draft);
              }
            }}
          />
          <button
            className="chat-send"
            type="submit"
            aria-label={t("chat.send")}
            // No longer gated on an existing conversation: the first message
            // is what creates one.
            disabled={!draft.trim() || sending}
          >
            <Icon name="send" />
          </button>
        </form>

        <div className="chat-footer">
          <Icon name="spark" />
          <span>{t("chat.footer")}</span>
        </div>
      </section>

      <button
        ref={launcher}
        className="floating-contact chat-launcher"
        type="button"
        aria-label={t(open ? "chat.launcher_close" : "chat.launcher_open")}
        aria-controls="zukatek-chat"
        aria-expanded={open}
        onClick={() => toggle(!open, open)}
      >
        <Icon name={open ? "close" : "chat"} />
      </button>
    </div>
  );
}
