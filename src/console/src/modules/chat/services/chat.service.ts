import api from "@/services/api";

// Mirrors backend/internal/modules/ai/conversation (staff.go + staff_handler.go).
// Everything here needs ai.chat.handle: a transcript is a customer conversation.

export type ConversationState = "bot" | "waiting" | "human" | "closed";
export type MessageRole = "visitor" | "assistant" | "staff" | "system";

export interface InboxItem {
  id: string;
  state: ConversationState;
  claimed_by_user_id: string | null;
  lead_id: string | null;
  last_message: string | null;
  last_role: MessageRole | null;
  message_count: number;
  last_activity_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export const chatService = {
  async inbox(state?: ConversationState): Promise<InboxItem[]> {
    const qs = state ? `?state=${state}` : "";
    const { data } = await api.get<{ items: InboxItem[] }>(
      `/chat/conversations${qs}`,
    );
    return data.items;
  },

  async transcript(id: string): Promise<ChatMessage[]> {
    const { data } = await api.get<{ items: ChatMessage[] }>(
      `/chat/conversations/${id}`,
    );
    return data.items;
  },

  async claim(id: string): Promise<void> {
    await api.post(`/chat/conversations/${id}/claim`);
  },

  async release(id: string): Promise<void> {
    await api.post(`/chat/conversations/${id}/release`);
  },

  async close(id: string): Promise<void> {
    await api.post(`/chat/conversations/${id}/close`);
  },

  async reply(id: string, content: string): Promise<ChatMessage> {
    const { data } = await api.post<ChatMessage>(
      `/chat/conversations/${id}/messages`,
      { content },
    );
    return data;
  },

  /** "I am at my desk." The assistant refuses a handoff when nobody has
   *  beaten recently, so this is what makes the handoff button work at all. */
  async beat(): Promise<number> {
    const { data } = await api.post<{ online: number }>("/chat/presence");
    return data.online;
  },
};
