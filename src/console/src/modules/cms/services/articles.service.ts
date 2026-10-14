import api from "@/services/api";

// Mirrors the Go backend (backend/internal/modules/cms models.go — Articles,
// status-field workflow). The list returns ArticleListItem (no body); GET/{id}
// + mutations return the full ArticleResponse.

// 6-state editorial workflow (workflow-states §2). pending_edit was removed
// (god-mode redesign) → needs_revision.
export type ArticleStatus =
  | "draft"
  | "pending_review"
  | "needs_revision"
  | "scheduled"
  | "published"
  | "archived";

export interface ArticleAuthor {
  id: string;
  name: string;
}

export interface ArticleCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleTagRef {
  id: string;
  name: string;
  slug: string;
}

// PageSEO — the shared SEO sub-object (article + page). noindex/nofollow are
// booleans; the rest are nullable strings.
export interface ArticleSEO {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
  canonical_url?: string | null;
  noindex: boolean;
  nofollow: boolean;
  og_title?: string | null;
  og_description?: string | null;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  category: ArticleCategoryRef | null;
  author: ArticleAuthor;
  published_at: string | null;
  updated_at: string;
}

// body_json is the Tiptap document (opaque JSON re-edited by the editor).
export type TiptapDoc = Record<string, unknown>;

export interface ArticleDetail extends ArticleListItem {
  excerpt: string | null;
  body_html: string | null;
  body_json: TiptapDoc | null;
  tags: ArticleTagRef[];
  featured_url: string | null;
  og_url: string | null;
  seo: ArticleSEO;
  review_note: string | null;
  // Creator's reviewer-class at create time → drives the status matrix.
  author_role: string;
  published_snapshot: unknown;
  created_at: string;
}

export interface CreateArticleBody {
  title: string;
  slug?: string;
  status?: ArticleStatus;
  publish_at?: string;
  excerpt?: string;
  body_html?: string;
  body_json?: TiptapDoc;
  category_id?: string | null;
  tag_ids?: string[];
  featured_path?: string;
  og_path?: string;
  seo?: ArticleSEO;
}

// PATCH: updated_at is the optimistic-lock token (required). category_id follows
// Optional semantics (omit = unchanged · null = clear). note required when an
// admin sets needs_revision; publish_at required when status=scheduled.
export interface UpdateArticleBody {
  updated_at: string;
  title?: string;
  slug?: string;
  status?: ArticleStatus;
  publish_at?: string;
  note?: string;
  excerpt?: string;
  body_html?: string;
  body_json?: TiptapDoc;
  category_id?: string | null;
  tag_ids?: string[];
  featured_path?: string;
  og_path?: string;
  seo?: ArticleSEO;
  regenerate_slug?: boolean;
}

export interface ArticleListParams {
  q?: string;
  status?: ArticleStatus | "";
  category_id?: string;
  tag?: string;
  author_id?: string;
  page?: number;
  page_size?: number;
  sort?: string;
  /** ISO day (YYYY-MM-DD), Vietnam time; the whole `created_to` day counts. */
  created_from?: string;
  created_to?: string;
}

export interface ArticleListResult {
  items: ArticleListItem[];
  total: number;
  page: number;
  page_size: number;
}

// Returned by POST /cms/articles/{id}/upload (deferred-on-save image flow): the
// stored path (persisted via a follow-up PATCH) + the served URL to render.
export interface UploadMediaResponse {
  path: string;
  url: string;
}

export type UploadPurpose = "featured" | "og" | "inline";

export const articlesService = {
  async list(params: ArticleListParams): Promise<ArticleListResult> {
    const { data } = await api.get<ArticleListResult>("/cms/articles", {
      params,
    });
    return data;
  },

  async get(id: string): Promise<ArticleDetail> {
    const { data } = await api.get<ArticleDetail>(`/cms/articles/${id}`);
    return data;
  },

  async create(body: CreateArticleBody): Promise<ArticleDetail> {
    const { data } = await api.post<ArticleDetail>("/cms/articles", body);
    return data;
  },

  async update(id: string, body: UpdateArticleBody): Promise<ArticleDetail> {
    const { data } = await api.patch<ArticleDetail>(
      `/cms/articles/${id}`,
      body,
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/cms/articles/${id}`);
  },

  // Multipart upload (api.postForm sets the boundary). Owner is the article id
  // in the path; purpose picks the slot (featured/og/inline).
  async uploadMedia(
    id: string,
    file: File,
    purpose: UploadPurpose,
  ): Promise<UploadMediaResponse> {
    const { data } = await api.postForm<UploadMediaResponse>(
      `/cms/articles/${id}/upload`,
      { file, purpose },
    );
    return data;
  },
};
