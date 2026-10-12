import { MessageSquare, Send, UserCheck, UserMinus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
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
import type { ConversationState, MessageRole } from "../services/chat.service";

const STATE_TONE: Record<ConversationState, StatusTone> = {
  bot: "neutral",
  waiting: "warning",
  human: "success",
  closed: "neutral",
};

/** Who said it. `staff` is a colleague, `assistant` is the bot — a transcript
 *  read back later has to be able to tell them apart. */
function roleTone(role: MessageRole): string {
  switch (role) {
    case "visitor":
      return "bg-muted";
    case "staff":
      return "bg-primary text-primary-foreground";
    case "system":
      return "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    default:
      return "bg-background border";
  }
}

// The operator's side of the assistant: the live queue, and one conversation at
// a time. Opening this screen puts you on duty — see usePresenceHeartbeat.
export default function ChatInbox() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const inbox = useInbox();
  const transcript = useTranscript(selected);
  const claim = useClaim();
  const release = useRelease();
  const closeOne = useCloseConversation();
  const reply = useReply(selected);
  const log = useRef<HTMLDivElement>(null);

  // Being on this screen IS being on duty. The assistant refuses a handoff when
  // nobody has beaten recently, so leaving the screen takes you off the rota.
  usePresenceHeartbeat(true);

  const current = inbox.data?.find((c) => c.id === selected) ?? null;

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [transcript.data]);

  const fail = (err: unknown) => toast.error(parseApiError(err, t).message);

  const send = () => {
    const text = draft.trim();
    if (!text || !selected) return;
    reply.mutate(text, {
      onSuccess: () => setDraft(""),
      onError: fail,
    });
  };

  return (
    <div className="space-y-3">
      <PageHeader title={t("chat.title")} subtitle={t("chat.subtitle")} />

      {inbox.isError ? (
        <Alert variant="danger" message={parseApiError(inbox.error, t).message} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Queue */}
          <div className="space-y-2" data-testid="chat-inbox">
            {inbox.isLoading && !inbox.data ? (
              Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : (inbox.data ?? []).length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                {t("chat.empty")}
              </p>
            ) : (
              (inbox.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid="chat-inbox-row"
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                    selected === c.id && "border-primary bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={STATE_TONE[c.state]}>
                      {t(`chat.state.${c.state}`)}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(c.last_activity_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm">
                    {c.last_message ?? t("chat.no_messages")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("chat.message_count", { count: c.message_count })}
                    {c.lead_id && ` · ${t("chat.has_lead")}`}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Thread */}
          <div className="flex min-h-[28rem] flex-col rounded-lg border">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 size-6" />
                  {t("chat.pick_one")}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <StatusBadge tone={STATE_TONE[current?.state ?? "bot"]}>
                    {t(`chat.state.${current?.state ?? "bot"}`)}
                  </StatusBadge>
                  <div className="flex flex-wrap gap-2">
                    {current?.state !== "human" && current?.state !== "closed" && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={claim.isPending}
                        onClick={() =>
                          claim.mutate(selected, {
                            onSuccess: () => toast.success(t("chat.claimed")),
                            onError: fail,
                          })
                        }
                      >
                        <UserCheck className="size-4" />
                        {t("chat.claim")}
                      </Button>
                    )}
                    {current?.state === "human" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={release.isPending}
                        onClick={() =>
                          release.mutate(selected, {
                            onSuccess: () => toast.success(t("chat.released")),
                            onError: fail,
                          })
                        }
                      >
                        <UserMinus className="size-4" />
                        {t("chat.release")}
                      </Button>
                    )}
                    {current?.state !== "closed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={closeOne.isPending}
                        onClick={() =>
                          closeOne.mutate(selected, {
                            onSuccess: () => toast.success(t("chat.closed_toast")),
                            onError: fail,
                          })
                        }
                      >
                        <X className="size-4" />
                        {t("chat.close")}
                      </Button>
                    )}
                  </div>
                </div>

                <div
                  ref={log}
                  className="flex-1 space-y-3 overflow-y-auto p-4"
                  data-testid="chat-thread"
                >
                  {transcript.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    (transcript.data ?? []).map((m) => (
                      <div
                        key={m.id}
                        data-testid="chat-message"
                        className={cn(
                          "flex flex-col gap-1",
                          m.role === "staff" ? "items-end" : "items-start",
                        )}
                      >
                        <span className="text-xs text-muted-foreground">
                          {t(`chat.role.${m.role}`)} · {formatDateTime(m.created_at)}
                        </span>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                            roleTone(m.role),
                          )}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t p-3">
                  {/* Replying does NOT require having claimed it: a colleague
                      covering for someone at lunch is normal, and the author is
                      recorded either way. */}
                  <div className="flex items-end gap-2">
                    <Textarea
                      rows={2}
                      value={draft}
                      maxLength={2000}
                      disabled={current?.state === "closed"}
                      placeholder={t("chat.reply_ph")}
                      aria-label={t("chat.reply_ph")}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      disabled={!draft.trim() || reply.isPending}
                      onClick={send}
                    >
                      <Send className="size-4" />
                      {t("chat.send")}
                    </Button>
                  </div>
                  {current?.state === "bot" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("chat.bot_still_answering")}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
