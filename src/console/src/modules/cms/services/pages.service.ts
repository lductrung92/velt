import api from "@/services/api";

// CMS pages client. Mirrors backend cms/pages: a hierarchical tree of pages with
// a 4-state lifecycle + published snapshot. Widgets are embedded inline in the
// page body (body_json), not as a separate block list.

export type PageStatus = "draft" | "scheduled" | "published" | "archived";

// kind=landing → backend auto-creates a landing and attaches it (landing_id).
export type PageKind = "content" | "landing";

// GET /cms/pages returns roots with `children` nested (no body).
export interface PageNode {
  id: string;
  title: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  status: PageStatus;
  landing_id: string | null;
  children: PageNode[];
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
  parent_id: string | null;
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
  parent_id?: string | null;
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

export const pagesService = {
  async list(): Promise<PageNode[]> {
    const { data } = await api.get<PageNode[]>("/cms/pages");
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
