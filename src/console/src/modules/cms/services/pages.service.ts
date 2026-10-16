import api from "@/services/api";

// CMS pages client. Mirrors backend cms/pages: a hierarchical tree of pages with
// a 4-state lifecycle + published snapshot. Widgets are embedded inline in the
// page body (body_json), not as a separate block list.

export type PageStatus = "draft" | "scheduled" | "published" | "archived";

// kind=landing → backend auto-creates a landing and attaches it (landing_id).
export type PageKind = "content" | "landing";

/**
 * One row of the pages list.
 *
 * Flat, and with no parent: a page's address is a single slug segment, the site
 * routes none of them under another, and nothing here could ever set a parent.
 * The column still exists in the database — no data was discarded — but it is
 * not part of what the list says any more.
 */
export interface PageListItem {
  id: string;
  title: string;
  slug: string;
  template: string | null;
  status: PageStatus;
  landing_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageListResult {
  items: PageListItem[];
  total: number;
  page: number;
  page_size: number;
}

/** A page as a picker needs it: the whole set, never one page of it. */
export interface PageOption {
  id: string;
  title: string;
  slug: string;
  status: PageStatus;
}

export interface PageSEO {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
  canonical_url?: string | null;
  noindex: boolean;
  nofollow: boolean;
  og_title?: string | null;
  og_description?: string | null;
}

export type TiptapDoc = Record<string, unknown>;

export interface PageDetail {
  id: string;
  title: string;
  slug: string;
  body_html: string | null;
  body_json: TiptapDoc | null;
  sort_order: number;
  template: string | null;
  status: PageStatus;
  og_path: string | null;
  landing_id: string | null;
  seo: PageSEO;
  published_at: string | null;
  published_snapshot: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreatePageBody {
  title: string;
  kind?: PageKind;
  slug?: string;
  sort_order?: number;
  body_html?: string;
  body_json?: TiptapDoc;
  landing_id?: string | null;
  seo?: PageSEO;
}

export interface UpdatePageBody {
  updated_at: string; // optimistic-lock token
  title?: string;
  slug?: string;
  body_html?: string;
  body_json?: TiptapDoc;
  landing_id?: string | null; // present → set/clear; absent → unchanged
  seo?: PageSEO;
  regenerate_slug?: boolean;
}

export interface PageListParams {
  q?: string;
  status?: PageStatus | "";
  /** "1" narrows the list to pages built with the landing designer. */
  landing?: "1";
  /** ISO day (YYYY-MM-DD), Vietnam time; the whole `created_to` day counts. */
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}

export const pagesService = {
  async list(params?: PageListParams): Promise<PageListResult> {
    const { data } = await api.get<PageListResult>("/cms/pages", { params });
    return data;
  },
  async options(): Promise<PageOption[]> {
    const { data } = await api.get<PageOption[]>("/cms/pages/options");
    return data;
  },
  async get(id: string): Promise<PageDetail> {
    const { data } = await api.get<PageDetail>(`/cms/pages/${id}`);
    return data;
  },
  async create(body: CreatePageBody): Promise<PageDetail> {
    const { data } = await api.post<PageDetail>("/cms/pages", body);
    return data;
  },
  async update(id: string, body: UpdatePageBody): Promise<PageDetail> {
    const { data } = await api.patch<PageDetail>(`/cms/pages/${id}`, body);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/cms/pages/${id}`);
  },
  async publish(id: string): Promise<PageDetail> {
    const { data } = await api.post<PageDetail>(`/cms/pages/${id}/publish`);
    return data;
  },
  async unpublish(id: string): Promise<PageDetail> {
    const { data } = await api.post<PageDetail>(`/cms/pages/${id}/unpublish`);
    return data;
  },
};
