import api from "@/services/api";

// Newsletter subscribers.
//
// The screen lives in the CRM module because that is where someone looks for
// "people who gave us their address", but the API is under /cms: the opt-in
// belongs to the site's content layer, and the backend module that owns it is
// cms/newsletter. Permission is cms.newsletter.manage, not a crm.* one.

export type SubscriberStatus = "" | "active" | "unsubscribed";

export interface Subscriber {
  id: string;
  email: string;
  /** Where the address came from, e.g. "footer". Null for older rows. */
  source_key: string | null;
  confirmed_at: string | null;
  /** Set once they opt out. The row is kept so the address is not re-added
   *  silently by a later form submission. */
  unsubscribed_at: string | null;
  created_at: string;
}

export interface SubscriberListParams {
  status?: SubscriberStatus;
  page?: number;
  page_size?: number;
}

export interface SubscriberListResponse {
  items: Subscriber[];
  total: number;
  page: number;
  page_size: number;
}

export const newsletterService = {
  async list(params: SubscriberListParams): Promise<SubscriberListResponse> {
    const { data } = await api.get<SubscriberListResponse>(
      "/cms/newsletter/subscribers",
      { params },
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/cms/newsletter/subscribers/${id}`);
  },
};
