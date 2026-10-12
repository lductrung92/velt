import { useCallback, useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { contactFor } from "../lib/links";
import {
  ChatError,
  loadTranscript,
  openStream,
  requestHuman,
  sendMessage,
  startConversation,
  type ChatMessage,
  type ConversationState,
} from "../lib/chatApi";
import { Icon } from "./Icon";

// The assistant, wired to the real backend.
//
// There is ONE conversation, not a bot channel and a staff channel: on the
// server a member joins the visitor's existing thread, and the `state` field
// says who is speaking. Two tabs over one thread would have been a lie about
// the data model — and the old "no staff are here" copy becomes false the
// moment handoff works.

const SUGGESTIONS = [
  "Tôi cần quản lý công việc nhóm",
  "Có bản dùng thử không?",
  "Cho tôi gặp người phụ trách",
];

/** What the label above a bubble says. `staff` is a real person answering, and
 *  the visitor should be able to tell. */
function speaker(role: ChatMessage["role"], degraded: boolean): string {
  switch (role) {
    case "visitor":
      return "Bạn";
    case "staff":
      return "ZUKATEK · Người phụ trách";
    case "system":
      return "ZUKATEK";
    default:
      return degraded ? "ZUKATEK · Trả lời rút gọn" : "Trợ lý ZUKATEK";
  }
}

export function Chat() {
  const { data, referrer, url } = useSite();
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

  const target = contactFor(data, referrer?.id);
  const contactLink =
    target.zalo || (target.email ? `mailto:${target.email}` : "#contact");

  // Opening the widget is what starts a conversation — not page load. A visitor
  // who never opens the chat costs nothing and leaves no row behind.
  useEffect(() => {
    if (!open || conversationId.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const started = await startConversation({
          ref: referrer?.id ? url.searchParams.get("ref") ?? "" : "",
          page: url.pathname,
        });
        if (cancelled) return;
        conversationId.current = started.id;
        setState(started.state);
        setDegraded(started.degraded);
        const { items } = await loadTranscript(started.id);
        if (cancelled) return;
        setMessages(items);

        closeStream.current = openStream(started.id, {
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
      } catch {
        if (!cancelled) {
          setNotice(
            "Chưa kết nối được trợ lý. Bạn có thể liên hệ trực tiếp bên dưới.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, referrer?.id, url]);

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
    const id = conversationId.current;
    if (!message || !id || sending) return;

    setDraft("");
    setSending(true);
    setNotice("");
    try {
      const res = await sendMessage(id, message);
      setDegraded(res.degraded);
    } catch (err) {
      setNotice(
        err instanceof ChatError && err.key === "turn_limit_reached"
          ? "Cuộc trò chuyện đã dài. Bạn để lại liên hệ để bên mình chủ động gọi lại nhé."
          : "Chưa gửi được tin nhắn. Bạn thử lại giúp mình.",
      );
    } finally {
      setSending(false);
      input.current?.focus({ preventScroll: true });
    }
  }

  async function askForHuman() {
    const id = conversationId.current;
    if (!id) return;
    setNotice("");
    try {
      const res = await requestHuman(id);
      setState(res.state);
    } catch (err) {
      // Nobody on duty is the expected case outside office hours, and saying so
      // beats parking the visitor in a queue that will not move.
      setNotice(
        err instanceof ChatError && err.key === "no_staff_online"
          ? "Hiện không có ai trực. Bạn để lại số điện thoại hoặc Zalo, bên mình liên hệ lại sớm."
          : "Chưa chuyển được. Bạn thử lại hoặc liên hệ trực tiếp bên dưới.",
      );
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
            <h2 id="chat-title">Trò chuyện với ZUKATEK</h2>
            <p>
              {withHuman
                ? "Bạn đang nói chuyện với người phụ trách"
                : waiting
                  ? "Đang chờ người phụ trách…"
                  : "Tìm sản phẩm phù hợp với bạn"}
            </p>
          </div>
          <button
            ref={closeButton}
            className="chat-close"
            type="button"
            aria-label="Thu nhỏ chatbox"
            onClick={() => toggle(false, true)}
          >
            <Icon name="close" />
          </button>
        </header>

        {degraded && (
          <div className="chat-preview-note">
            <span>RÚT GỌN</span>
            <p>Trợ lý đang trả lời rút gọn · Người phụ trách vẫn hỗ trợ được</p>
          </div>
        )}

        <div className="chat-conversation" id="chat-conversation">
          <div
            ref={log}
            className="chat-messages"
            role="log"
            aria-label="Nội dung trò chuyện"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((message) => (
              <div
                className={`chat-message chat-message-${
                  message.role === "visitor" ? "user" : "assistant"
                }`}
                key={message.id}
              >
                {message.role !== "visitor" && (
                  <span className="chat-message-avatar">
                    <Icon name={message.role === "staff" ? "support" : "spark"} />
                  </span>
                )}
                <div className="chat-message-body">
                  <span className="chat-message-label">
                    {speaker(message.role, degraded)}
                  </span>
                  <div className="chat-bubble">{message.content}</div>
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
                    {speaker("assistant", degraded)}
                  </span>
                  <div className="chat-bubble">{streaming}</div>
                </div>
              </div>
            )}
          </div>

          <div className="chat-suggestions" aria-label="Câu hỏi gợi ý">
            {messages.length <= 1 &&
              SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={sending || !conversationId.current}
                  onClick={() => void submit(text)}
                >
                  {text}
                </button>
              ))}
          </div>
        </div>

        <div className="chat-handoff">
          {notice && <p>{notice}</p>}
          <div>
            <button
              type="button"
              className="chat-copy"
              disabled={!conversationId.current || waiting || withHuman}
              onClick={() => void askForHuman()}
            >
              <Icon name="support" />
              {withHuman
                ? "Đã có người phụ trách"
                : waiting
                  ? "Đang chờ…"
                  : "Gặp người thật"}
            </button>
            <a
              className="chat-contact-link"
              href={contactLink}
              target={target.zalo ? "_blank" : undefined}
              rel={target.zalo ? "noopener noreferrer" : undefined}
              onClick={() => toggle(false)}
            >
              Liên hệ trực tiếp <Icon name="arrow" />
            </a>
          </div>
        </div>

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <label className="sr-only" htmlFor="chat-input">
            Nhập tin nhắn
          </label>
          <textarea
            ref={input}
            id="chat-input"
            rows={1}
            maxLength={2000}
            placeholder={
              withHuman
                ? "Nhắn cho người phụ trách…"
                : "Hỏi ZUKATEK về sản phẩm…"
            }
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
            aria-label="Gửi tin nhắn"
            disabled={!draft.trim() || sending || !conversationId.current}
          >
            <Icon name="send" />
          </button>
        </form>

        <div className="chat-footer">
          <Icon name="spark" />
          <span>Hỗ trợ sản phẩm từ ZUKATEK</span>
        </div>
      </section>

      <button
        ref={launcher}
        className="floating-contact chat-launcher"
        type="button"
        aria-label={open ? "Thu nhỏ chatbox ZUKATEK" : "Mở chatbox ZUKATEK"}
        aria-controls="zukatek-chat"
        aria-expanded={open}
        onClick={() => toggle(!open, open)}
      >
        <Icon name={open ? "close" : "chat"} />
      </button>
    </div>
  );
}
