import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { chatService, type ConversationState } from "../services/chat.service";

export const chatKeys = {
  all: ["chat"] as const,
  inbox: (state?: ConversationState) => [...chatKeys.all, "inbox", state ?? "live"] as const,
  transcript: (id: string) => [...chatKeys.all, "transcript", id] as const,
};

/** The inbox is a live queue, so it polls. SSE would be tidier, but a list that
 *  refreshes every few seconds is enough and costs one endpoint instead of a
 *  second stream per operator. */
export function useInbox(state?: ConversationState) {
  return useQuery({
    queryKey: chatKeys.inbox(state),
    queryFn: () => chatService.inbox(state),
    refetchInterval: 5_000,
  });
}

export function useTranscript(id: string | null) {
  return useQuery({
    queryKey: chatKeys.transcript(id ?? ""),
    queryFn: () => chatService.transcript(id as string),
    enabled: !!id,
  });
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
