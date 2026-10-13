import {
  ArrowDown,
  ArrowLeft,
  Bot,
  CheckCheck,
  ChevronRight,
  Headphones,
  Inbox,
  Loader2,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  User,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/utils/apiError";
import { formatDateTime } from "@/utils/format";

import {
  useClaim,
  useCloseConversation,
  useInbox,
  usePresenceHeartbeat,
  useRelease,
  useReply,
  useTranscript,
} from "../hooks/useChat";
import type { ConversationState, InboxItem } from "../services/chat.service";
import "./chat-inbox.css";

const STATE_TONE: Record<ConversationState, StatusTone> = {
  bot: "neutral",
  waiting: "warning",
  human: "success",
  closed: "neutral",
};
const FILTERS = ["all", "waiting", "human", "bot", "closed"] as const;
type Filter = (typeof FILTERS)[number];
const reference = (id: string) => id.slice(-6).toUpperCase();

function ConversationArtwork() {
  return (
    <div className="chat-welcome-art" aria-hidden="true">
      <div className="chat-welcome-orbit" />
      <div className="chat-art-card chat-art-card-back">
        <User />
        <div>
          <i />
          <i />
        </div>
      </div>
      <div className="chat-art-card chat-art-card-front">
        <Bot />
        <div>
          <i />
          <i />
          <i />
        </div>
        <span>
          <CheckCheck />
        </span>
      </div>
      <span className="chat-art-badge">
        <MessageCircle />
      </span>
    </div>
  );
}

// Opening this screen keeps the existing operator heartbeat active. Actions
// use the existing staff endpoints and their server authorization.
export default function ChatInbox() {
  const { t, i18n } = useTranslation();
  const [selection, setSelection] = useState<InboxItem | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newMessages, setNewMessages] = useState(false);
  const selected = selection?.id ?? null;
  const inbox = useInbox(filter === "all" ? undefined : filter);
  const transcript = useTranscript(selected);
  const claim = useClaim();
  const release = useRelease();
  const closeOne = useCloseConversation();
  const reply = useReply(selected);
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  usePresenceHeartbeat(true);

  const current = inbox.data?.find((c) => c.id === selected) ?? selection;
  const draft = selected ? (drafts[selected] ?? "") : "";
  const query = search.trim().toLocaleLowerCase(i18n.language);
  const conversations = (inbox.data ?? []).filter(
    (c) =>
      !query ||
      `${c.id} ${c.last_message ?? ""}`
        .toLocaleLowerCase(i18n.language)
        .includes(query),
  );
  const lastMessage = transcript.data?.at(-1)?.id;
  const sendingDisabled =
    !current || current.state === "closed" || reply.isPending;
  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);
  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));

  useEffect(() => {
    if (!log.current) return;
    if (atBottom.current) log.current.scrollTop = log.current.scrollHeight;
    else if (lastMessage) setNewMessages(true);
  }, [lastMessage, selected]);

  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected]);

  const open = (item: InboxItem) => {
    atBottom.current = true;
    setNewMessages(false);
    setSelection(item);
  };
  const send = () => {
    const text = draft.trim();
    if (!text || !selected || sendingDisabled) return;
    const sentTo = selected;
    reply.mutate(text, {
      onSuccess: () => {
        setDrafts((previous) => ({ ...previous, [sentTo]: "" }));
        atBottom.current = true;
      },
      onError: fail,
    });
  };
  const changeState = (state: ConversationState) => {
    if (current)
      setSelection((previous) =>
        previous?.id === current.id ? { ...current, state } : previous,
      );
  };

  return (
    <div className="console-chat">
      <PageHeader
        title={t("chat.title")}
        subtitle={t("chat.subtitle")}
        actions={
          <span className="chat-support-label">
            <Headphones className="size-3.5" aria-hidden />
            {t("chat.support_workspace")}
          </span>
        }
      />
      <div className="console-chat-workspace" data-thread-open={!!selected}>
        <aside
          className="chat-queue"
          aria-label={t("chat.conversations")}
          data-testid="chat-inbox"
        >
          <div className="chat-queue-heading">
            <h2>
              <MessageSquare className="size-4 text-primary-ink" aria-hidden />
              {t("chat.conversations")}
              <span className="chat-count">
                {inbox.isPending ? "—" : conversations.length}
              </span>
            </h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("chat.refresh")}
              title={t("chat.refresh")}
              disabled={inbox.isFetching}
              onClick={() => void inbox.refetch()}
            >
              <RotateCcw
                className={cn(
                  "size-3.5",
                  inbox.isFetching && "animate-spin motion-reduce:animate-none",
                )}
                aria-hidden
              />
            </Button>
          </div>
          <div className="chat-queue-tools">
            <div className="chat-search">
              <Search className="size-4" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("chat.search_ph")}
                aria-label={t("chat.search_label")}
              />
              {search && (
                <button
                  type="button"
                  aria-label={t("chat.clear_search")}
                  onClick={() => setSearch("")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div
              className="chat-filters"
              role="group"
              aria-label={t("chat.filter_label")}
            >
              {FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => {
                    if (current) setSelection(current);
                    setFilter(value);
                  }}
                >
                  {t(`chat.filter.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-queue-list">
            {inbox.isPending ? (
              <div className="space-y-3 p-4" aria-label={t("common.loading")}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : inbox.isError ? (
              <div className="p-4">
                <Alert
                  variant="danger"
                  message={parseApiError(inbox.error, t).message}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void inbox.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : !conversations.length ? (
              <div className="chat-queue-empty">
                <span>
                  <Inbox className="size-6" strokeWidth={1.5} aria-hidden />
                </span>
                <h3>
                  {t(
                    search || filter !== "all"
                      ? "chat.no_results"
                      : "chat.empty",
                  )}
                </h3>
                <p>
                  {t(
                    search || filter !== "all"
                      ? "chat.no_results_hint"
                      : "chat.empty_hint",
                  )}
                </p>
                {(search || filter !== "all") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    {t("chat.reset_filters")}
                  </Button>
                )}
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid="chat-inbox-row"
                  aria-pressed={selected === c.id}
                  className="chat-conversation"
                  onClick={() => open(c)}
                >
                  <span className="chat-visitor-avatar" data-state={c.state}>
                    <User className="size-4" aria-hidden />
                    <i />
                  </span>
                  <span className="chat-conversation-copy">
                    <span className="chat-conversation-top">
                      <strong>
                        {t("chat.visitor_name", { id: reference(c.id) })}
                      </strong>
                      <time
                        dateTime={c.last_activity_at}
                        title={formatDateTime(c.last_activity_at)}
                      >
                        {time(c.last_activity_at)}
                      </time>
                    </span>
                    <span className="chat-conversation-preview">
                      {c.last_message ?? t("chat.no_messages")}
                    </span>
                    <span className="chat-conversation-meta">
                      <span className="chat-state-label" data-state={c.state}>
                        {t(`chat.filter.${c.state}`)}
                      </span>
                      <span>
                        {t("chat.message_count", { count: c.message_count })}
                        {c.lead_id && (
                          <UserCheck
                            className="ml-1 inline size-3"
                            aria-label={t("chat.has_lead")}
                          />
                        )}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="chat-conversation-arrow size-3.5"
                    aria-hidden
                  />
                </button>
              ))
            )}
          </div>
          <div className="chat-queue-footer">
            <span className="chat-sync-dot" />
            {t("chat.queue_hint")}
          </div>
        </aside>
        <section
          className="chat-detail"
          aria-label={t("chat.conversation_detail")}
        >
          {!current ? (
            <div className="chat-welcome">
              <span className="chat-welcome-eyebrow">
                {t("chat.brand")} · {t("chat.customer_support")}
              </span>
              <ConversationArtwork />
              <h2>{t("chat.welcome_title")}</h2>
              <p>{t("chat.welcome_description")}</p>
              <div className="chat-welcome-features">
                <span>
                  <Bot className="size-4" aria-hidden />
                  {t("chat.welcome_ai")}
                </span>
                <span>
                  <Headphones className="size-4" aria-hidden />
                  {t("chat.welcome_team")}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-thread-heading">
                <div className="chat-thread-identity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="chat-back"
                    aria-label={t("chat.back_to_inbox")}
                    onClick={() => setSelection(null)}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <span className="chat-visitor-avatar">
                    <User className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2>
                      {t("chat.visitor_name", { id: reference(current.id) })}
                    </h2>
                    <div className="chat-thread-status">
                      <StatusBadge tone={STATE_TONE[current.state]}>
                        {t(`chat.state.${current.state}`)}
                      </StatusBadge>
                      {current.lead_id && (
                        <span title={t("chat.has_lead")}>
                          <UserCheck className="size-3.5" aria-hidden />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="chat-thread-actions">
                  {current.state !== "human" && current.state !== "closed" && (
                    <Button
                      size="sm"
                      disabled={claim.isPending}
                      onClick={() =>
                        claim.mutate(current.id, {
                          onSuccess: () => {
                            changeState("human");
                            toast.success(t("chat.claimed"));
                          },
                          onError: fail,
                        })
                      }
                    >
                      <UserCheck className="size-3.5" />
                      {t("chat.claim")}
                    </Button>
                  )}
                  {current.state === "human" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={release.isPending}
                      onClick={() =>
                        release.mutate(current.id, {
                          onSuccess: () => {
                            changeState("bot");
                            toast.success(t("chat.released"));
                          },
                          onError: fail,
                        })
                      }
                    >
                      <UserMinus className="size-3.5" />
                      {t("chat.release")}
                    </Button>
                  )}
                  {current.state !== "closed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={closeOne.isPending}
                      onClick={() =>
                        closeOne.mutate(current.id, {
                          onSuccess: () => {
                            changeState("closed");
                            toast.success(t("chat.closed_toast"));
                          },
                          onError: fail,
                        })
                      }
                    >
                      <X className="size-3.5" />
                      {t("chat.close")}
                    </Button>
                  )}
                </div>
              </div>
              <div className="chat-thread-body">
                <div
                  ref={log}
                  className="chat-message-log"
                  data-testid="chat-thread"
                  aria-label={t("chat.message_history")}
                  aria-busy={transcript.isPending}
                  onScroll={() => {
                    const el = log.current;
                    if (el) {
                      atBottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                      if (atBottom.current) setNewMessages(false);
                    }
                  }}
                >
                  {transcript.isPending ? (
                    <div className="space-y-5">
                      <Skeleton className="h-16 w-2/3" />
                      <Skeleton className="ml-auto h-20 w-3/4" />
                      <Skeleton className="h-16 w-1/2" />
                    </div>
                  ) : transcript.isError ? (
                    <div>
                      <Alert
                        variant="danger"
                        message={parseApiError(transcript.error, t).message}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => void transcript.refetch()}
                      >
                        {t("common.retry")}
                      </Button>
                    </div>
                  ) : !transcript.data?.length ? (
                    <div className="chat-thread-empty">
                      <MessageCircle
                        className="size-8"
                        strokeWidth={1.2}
                        aria-hidden
                      />
                      <p>{t("chat.no_messages")}</p>
                    </div>
                  ) : (
                    transcript.data.map((m, index) => (
                      <Fragment key={m.id}>
                        {(index === 0 ||
                          date(m.created_at) !==
                            date(transcript.data[index - 1].created_at)) && (
                          <div className="chat-date-divider">
                            <span>{date(m.created_at)}</span>
                          </div>
                        )}
                        {m.role === "system" ? (
                          <div
                            className="chat-system-message"
                            data-testid="chat-message"
                          >
                            <span>{m.content}</span>
                            <time dateTime={m.created_at}>
                              {time(m.created_at)}
                            </time>
                          </div>
                        ) : (
                          <div
                            className="chat-message-row"
                            data-role={m.role}
                            data-testid="chat-message"
                          >
                            <span className="chat-message-avatar">
                              {m.role === "assistant" ? (
                                <Bot className="size-4" />
                              ) : m.role === "staff" ? (
                                <Headphones className="size-4" />
                              ) : (
                                <User className="size-4" />
                              )}
                            </span>
                            <div className="chat-message-content">
                              <div className="chat-message-label">
                                <span>{t(`chat.role.${m.role}`)}</span>
                                <time
                                  dateTime={m.created_at}
                                  title={formatDateTime(m.created_at)}
                                >
                                  {time(m.created_at)}
                                </time>
                              </div>
                              <div className="chat-message-bubble">
                                {m.content}
                              </div>
                            </div>
                          </div>
                        )}
                      </Fragment>
                    ))
                  )}
                </div>
                {newMessages && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="chat-new-messages"
                    onClick={() => {
                      if (log.current)
                        log.current.scrollTop = log.current.scrollHeight;
                      atBottom.current = true;
                      setNewMessages(false);
                    }}
                  >
                    <ArrowDown className="size-3.5" />
                    {t("chat.new_messages")}
                  </Button>
                )}
              </div>
              <div className="chat-composer">
                {current.state === "closed" ? (
                  <div className="chat-closed-notice">
                    <CheckCheck className="size-4" />
                    {t("chat.closed_notice")}
                  </div>
                ) : (
                  <>
                    {current.state === "bot" && (
                      <p className="chat-bot-notice">
                        <Bot className="size-3.5 shrink-0" aria-hidden />
                        {t("chat.bot_still_answering")}
                      </p>
                    )}
                    <div className="chat-composer-box">
                      <Textarea
                        rows={2}
                        value={draft}
                        maxLength={2000}
                        disabled={sendingDisabled}
                        placeholder={t("chat.reply_ph")}
                        aria-label={t("chat.reply_ph")}
                        onChange={(e) => {
                          if (selected)
                            setDrafts((old) => ({
                              ...old,
                              [selected]: e.target.value,
                            }));
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            send();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        disabled={!draft.trim() || sendingDisabled}
                        aria-label={t("chat.send")}
                        title={t("chat.send")}
                        onClick={send}
                      >
                        {reply.isPending ? (
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </Button>
                    </div>
                    <div className="chat-composer-footer">
                      <span>{t("chat.keyboard_hint")}</span>
                      <span>{draft.length}/2000</span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
