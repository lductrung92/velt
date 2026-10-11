import { useEffect, useRef, useState } from "react";
import { useSite } from "../context";
import { contactFor } from "../lib/links";
import { normalizeSearch } from "../lib/catalog";
import { Icon } from "./Icon";

type Mode = "ai" | "staff";
interface Message {
  kind: "assistant" | "user";
  text: string;
  link?: { label: string; href: string };
}
export function Chat() {
  const { data, referrer, isExample, href } = useSite();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<Mode>("ai");
  const [drafts, setDrafts] = useState({ ai: "", staff: "" }),
    [copyStatus, setCopyStatus] = useState("");
  const [conversations, setConversations] = useState<Record<Mode, Message[]>>({
    ai: [
      {
        kind: "assistant",
        text: "Chào bạn! 👋 Bạn đang tìm sản phẩm cho cá nhân, nhóm hay doanh nghiệp? Mình có thể hướng dẫn xem danh mục, trải nghiệm demo và cách mua sản phẩm.",
      },
    ],
    staff: [
      {
        kind: "assistant",
        text: `Chào bạn! 👋 Hãy để lại sản phẩm bạn quan tâm và nhu cầu sử dụng.${referrer ? ` Bạn đang xem ZUKATEK qua giới thiệu của ${referrer.name}.` : ""} Đây là bản xem thử; hiện chưa có nhân viên tham gia cuộc trò chuyện.`,
      },
    ],
  });
  const input = useRef<HTMLTextAreaElement>(null),
    log = useRef<HTMLDivElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const target = contactFor(data, referrer?.id),
    draft = drafts[mode];
  const contactLink =
    target.zalo ||
    (target.email ? `mailto:${target.email}` : href("/#contact"));
  useEffect(() => {
    if (!open) return;
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(input.current.scrollHeight, 96)}px`;
    }
  }, [open, mode, draft, conversations]);
  function toggle(value: boolean, restoreFocus = false) {
    setOpen(value);
    requestAnimationFrame(() => {
      if (value) {
        if (matchMedia("(min-width:768px)").matches)
          input.current?.focus({ preventScroll: true });
        else closeButton.current?.focus({ preventScroll: true });
      } else if (restoreFocus) launcher.current?.focus({ preventScroll: true });
    });
  }
  function reply(text: string): Message {
    const query = normalizeSearch(text);
    if (/gia|bao nhieu|mua|thanh toan|bao gia/.test(query))
      return {
        kind: "assistant",
        text: "Giá và điều kiện sử dụng cần được xác nhận theo từng sản phẩm. Bạn có thể chuyển sang tab Nhân viên và ghi sản phẩm quan tâm, số người dùng cùng nhu cầu triển khai để chuẩn bị lời nhắn tư vấn.",
        link: { label: "Xem cách mua sản phẩm", href: "/#collaboration" },
      };
    if (/demo|trai nghiem|dung thu/.test(query))
      return {
        kind: "assistant",
        text: `Mở trang chi tiết sản phẩm rồi chọn liên kết trải nghiệm.${isExample ? " Danh mục hiện có các mẫu minh họa; nút “Mở link tạm” dẫn tới example.com, chưa phải demo của ZUKATEK." : " Sản phẩm có demo công khai sẽ có nút mở bản trải nghiệm."}`,
        link: { label: "Mở danh mục sản phẩm", href: "/products" },
      };
    if (/nhan vien|lien he|tu van|nguoi that/.test(query))
      return {
        kind: "assistant",
        text: "Bạn có thể chọn tab Nhân viên ở phía trên để soạn nội dung cần tư vấn. Khi ZUKATEK kết nối dịch vụ chat, đây sẽ là nơi trao đổi trực tiếp với người phụ trách sản phẩm.",
      };
    if (/san pham|ca nhan|nhom|doanh nghiep|kham pha/.test(query))
      return {
        kind: "assistant",
        text: `Bạn có thể khám phá danh mục theo nhóm sản phẩm và tìm kiếm nhu cầu sử dụng.${isExample ? " Các mục hiện được gắn nhãn “Minh họa” để xem thử bố cục; thông tin sản phẩm thật sẽ được ZUKATEK bổ sung." : ""}`,
        link: { label: "Khám phá sản phẩm ZUKATEK", href: "/products" },
      };
    return {
      kind: "assistant",
      text: "Cảm ơn bạn đã chia sẻ. Đây là bản xem thử với câu trả lời mẫu, nên mình chưa xử lý được mọi câu hỏi. Bạn có thể hỏi về sản phẩm, demo, cách mua hoặc chuyển sang tab Nhân viên để chuẩn bị lời nhắn.",
    };
  }
  function submit(text: string) {
    const message = text.trim().slice(0, 2000);
    if (!message) return;
    setConversations((current) => {
      const next: Message[] = [
        ...current[mode],
        { kind: "user", text: message },
      ];
      if (mode === "ai") next.push(reply(message));
      else if (!current.staff.some((item) => item.kind === "user"))
        next.push({
          kind: "assistant",
          text: "Lời nhắn đã được thêm vào bản xem thử và chưa gửi đến nhân viên. Bạn có thể bổ sung nhu cầu, sao chép nội dung rồi dùng kênh liên hệ khi được cung cấp.",
        });
      return { ...current, [mode]: next };
    });
    setDrafts((current) => ({ ...current, [mode]: "" }));
    input.current?.focus({ preventScroll: true });
  }
  async function copy() {
    const text = conversations.staff
      .filter((item) => item.kind === "user")
      .map((item) => item.text)
      .join("\n\n");
    if (!text) {
      setCopyStatus("Hãy nhập lời nhắn trước khi sao chép.");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `Lời nhắn tư vấn sản phẩm ZUKATEK${referrer ? ` — qua ${referrer.name}` : ""}\n\n${text}`,
      );
      setCopyStatus("Đã sao chép lời nhắn. Nội dung chưa được gửi.");
    } catch {
      setCopyStatus(
        "Chưa sao chép được. Bạn có thể chọn nội dung lời nhắn và sao chép thủ công.",
      );
    }
  }
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
            <p>Tìm sản phẩm phù hợp với bạn</p>
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
        <div
          className="chat-tabs"
          role="tablist"
          aria-label="Chọn người hỗ trợ"
        >
          {(["ai", "staff"] as Mode[]).map((value) => (
            <button
              key={value}
              id={`chat-${value}-tab`}
              type="button"
              role="tab"
              aria-selected={mode === value}
              aria-controls="chat-conversation"
              tabIndex={mode === value ? 0 : -1}
              onClick={() => setMode(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "ai"
                    : event.key === "End"
                      ? "staff"
                      : mode === "ai"
                        ? "staff"
                        : "ai";
                setMode(next);
                document
                  .querySelector<HTMLButtonElement>(`#chat-${next}-tab`)
                  ?.focus();
              }}
            >
              <Icon name={value === "ai" ? "spark" : "support"} />
              {value === "ai" ? "AI hỗ trợ" : "Nhân viên"}
            </button>
          ))}
        </div>
        <div className="chat-preview-note">
          <span>XEM THỬ</span>
          <p>
            {mode === "ai"
              ? "Câu trả lời mẫu · Chưa kết nối AI trực tiếp"
              : "Chưa kết nối nhân viên · Tin nhắn chưa được gửi"}
          </p>
        </div>
        <div
          className="chat-conversation"
          id="chat-conversation"
          role="tabpanel"
          aria-labelledby={`chat-${mode}-tab`}
        >
          <div
            ref={log}
            className="chat-messages"
            role="log"
            aria-label="Nội dung trò chuyện"
            aria-live="polite"
            aria-relevant="additions"
          >
            {conversations[mode].map((message, index) => (
              <div
                className={`chat-message chat-message-${message.kind}`}
                key={`${mode}-${index}`}
              >
                {message.kind === "assistant" && (
                  <span className="chat-message-avatar">
                    <Icon name={mode === "ai" ? "spark" : "support"} />
                  </span>
                )}
                <div className="chat-message-body">
                  <span className="chat-message-label">
                    {message.kind === "user"
                      ? "Bạn"
                      : mode === "ai"
                        ? "ZUKATEK AI · Trả lời mẫu"
                        : "ZUKATEK · Xem thử"}
                  </span>
                  <div className="chat-bubble">{message.text}</div>
                  {message.link && (
                    <a
                      className="chat-message-link"
                      href={href(message.link.href)}
                    >
                      {message.link.label}
                      <Icon name="arrow" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="chat-suggestions" aria-label="Câu hỏi gợi ý">
            {mode === "ai" &&
              ["Khám phá sản phẩm", "Trải nghiệm demo", "Giá & cách mua"].map(
                (text) => (
                  <button key={text} type="button" onClick={() => submit(text)}>
                    {text}
                  </button>
                ),
              )}
          </div>
        </div>
        <div className="chat-handoff" hidden={mode !== "staff"}>
          <p>Lời nhắn được giữ trong phiên xem thử này.</p>
          <div>
            <button type="button" className="chat-copy" onClick={copy}>
              <Icon name="copy" />
              Sao chép
            </button>
            <a
              className="chat-contact-link"
              href={contactLink}
              target={target.zalo ? "_blank" : undefined}
              rel={target.zalo ? "noopener noreferrer" : undefined}
              onClick={() => toggle(false)}
            >
              Liên hệ ZUKATEK <Icon name="arrow" />
            </a>
          </div>
          <span className="chat-copy-status" role="status">
            {copyStatus}
          </span>
        </div>
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
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
              mode === "ai"
                ? "Hỏi ZUKATEK về sản phẩm…"
                : "Bạn cần nhân viên tư vấn điều gì?"
            }
            value={draft}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [mode]: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit(draft);
              }
            }}
          />
          <button
            className="chat-send"
            type="submit"
            aria-label="Gửi tin nhắn trong bản xem thử"
            disabled={!draft.trim()}
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
