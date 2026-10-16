import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { chatService, type ConversationState } from "../services/chat.service";
import { openInboxStream } from "../services/chatStream";

export const chatKeys = {
  all: ["chat"] as const,
  inbox: (state?: ConversationState) =>
    [...chatKeys.all, "inbox", state ?? "live"] as const,
  transcript: (id: string) => [...chatKeys.all, "transcript", id] as const,
};

/** The inbox is a live queue, kept current by the stream (useInboxStream).
 *
 *  The slow interval is a fallback, not the mechanism: a stream can die in a
 *  way neither end notices — a proxy dropping an idle connection, a laptop
 *  waking from sleep — and a queue that has silently stopped moving is the
 *  failure this whole feature exists to avoid. A minute of staleness in that
 *  case beats never refreshing again. */
export function useInbox(state?: ConversationState) {
  return useQuery({
    queryKey: chatKeys.inbox(state),
    queryFn: () => chatService.inbox(state),
    refetchInterval: 60_000,
  });
}

export function useTranscript(id: string | null) {
  return useQuery({
    queryKey: chatKeys.transcript(id ?? ""),
    queryFn: () => chatService.transcript(id as string),
    enabled: !!id,
    refetchInterval: id ? 60_000 : false,
  });
}

/**
 * Keeps the queue current from one stream instead of a poll per open console.
 *
 * The event only names a conversation, so the refetch is what actually loads
 * anything: the authenticated read stays the single place that decides what an
 * operator may see. The open thread is refetched only when the event is about
 * it — otherwise one busy conversation would reload every operator's screen.
 */
export function useInboxStream(enabled: boolean, openID: string | null) {
  const qc = useQueryClient();
  // Read through a ref so a change of open thread does not tear the stream
  // down and reconnect it.
  const open = useRef(openID);
  open.current = openID;

  useEffect(() => {
    if (!enabled) return;
    return openInboxStream((event) => {
      void qc.invalidateQueries({ queryKey: [...chatKeys.all, "inbox"] });
      if (event.conversation_id && event.conversation_id === open.current)
        void qc.invalidateQueries({
          queryKey: chatKeys.transcript(event.conversation_id),
        });
    });
  }, [enabled, qc]);
}

function useConversationAction(fn: (id: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // State changes show up in both the list and the open thread.
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

export function useClaim() {
  return useConversationAction((id) => chatService.claim(id));
}
export function useRelease() {
  return useConversationAction((id) => chatService.release(id));
}
export function useCloseConversation() {
  return useConversationAction((id) => chatService.close(id));
}

export function useReply(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatService.reply(id as string, content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.transcript(id ?? "") });
      void qc.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
}

/**
 * Tells the server this operator is at their desk, for as long as the screen
 * is open.
 *
 * Without a recent beat the assistant refuses every handoff with
 * `no_staff_online` — so this heartbeat is what makes the "talk to a person"
 * button work at all. The interval is well inside the server's 90s window so a
 * single missed request does not drop the operator off duty.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const beat = () => {
      if (alive) void chatService.beat().catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);
}
