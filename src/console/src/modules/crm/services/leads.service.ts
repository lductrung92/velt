import api from "@/services/api";

// Mirrors backend/internal/modules/crm/leads. A lead is someone who showed
// interest AND left a way to be reached — the API refuses one without a
// contact channel, so the form does too.

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
export type LeadSource = "chat" | "form" | "manual";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

export interface LeadProductRef {
  id: string;
  slug: string;
  name: string;
}

export interface LeadAssignee {
  id: string;
  slug: string;
  full_name: string;
}

export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  zalo: string | null;
  source: LeadSource;
  /** Set when the lead came from a chat: the conversation that produced it,
   *  which is what a seller actually wants before calling back. */
  conversation_id: string | null;
  assignee: LeadAssignee | null;
  status: LeadStatus;
  note: string | null;
  products: LeadProductRef[];
  created_at: string;
  updated_at: string;
}

export interface LeadListParams {
  q?: string;
  status?: string;
  source?: string;
  /** A member uuid, or "unassigned" for the shared queue. */
  assignee?: string;
  page?: number;
  page_size?: number;
}

export interface LeadListResponse {
  items: Lead[];
  total: number;
  page: number;
  page_size: number;
}

export interface LeadUpdate {
  name?: string;
  email?: string;
  phone?: string;
  zalo?: string;
  status?: LeadStatus;
  note?: string;
  assigned_member_id?: string;
  /** Assignment needs three outcomes from two JSON states: absent keeps,
   *  a value reassigns, and this flag returns it to the shared queue. */
  clear_assignee?: boolean;
}

export const leadsService = {
  async list(params: LeadListParams): Promise<LeadListResponse> {
    const { data } = await api.get<LeadListResponse>("/crm/leads", { params });
    return data;
  },

  async get(id: string): Promise<Lead> {
    const { data } = await api.get<Lead>(`/crm/leads/${id}`);
    return data;
  },

  async update(id: string, body: LeadUpdate): Promise<Lead> {
    const { data } = await api.patch<Lead>(`/crm/leads/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/crm/leads/${id}`);
  },
};
