import api from "@/services/api";

// Mirrors the Go backend exactly (contract-first, docs/apis/cms-api.md §5 +
// backend/internal/modules/cms). `GET /cms/tags` is server-paginated (q filters
// name/slug); each tag carries its article usage_count.
export interface Tag {
  id: string;
  name: string;
  slug: string;
  usage_count: number;
  created_at: string;
}

// Query params for the paginated tag list. Mirrors the Go TagListParams.
export interface TagListParams {
  q?: string;
  page?: number;
  page_size?: number;
  /** name | slug | usage ("-" prefix = desc); empty → name ASC. */
  sort?: string;
}

// Paginated tag list envelope (mirrors the Go TagListResult).
export interface TagListResult {
  items: Tag[];
  total: number;
  page: number;
  page_size: number;
}

// Lightweight tag (no usage_count) from `GET /cms/tags/options`, for selectors
// that need the full set: the merge-target picker + article-list tag filter.
export interface TagOption {
  id: string;
  name: string;
  slug: string;
}

export interface CreateTagBody {
  name: string;
  slug?: string;
}

// PATCH: name, plus EITHER an explicit slug (manual-edit ON) OR regenerate_slug
// (manual-edit OFF — re-derive from name). See business-rules §1.
export interface UpdateTagBody {
  name?: string;
  slug?: string;
  regenerate_slug?: boolean;
}

export interface MergeTagsBody {
  source_id: string;
  target_id: string;
}

export const tagsService = {
  async list(params: TagListParams): Promise<TagListResult> {
    const { data } = await api.get<TagListResult>("/cms/tags", { params });
    return data;
  },

  // Full flat list for selectors (merge target, article filter).
  async options(): Promise<TagOption[]> {
    const { data } = await api.get<TagOption[]>("/cms/tags/options");
    return data;
  },

  async create(body: CreateTagBody): Promise<Tag> {
    const { data } = await api.post<Tag>("/cms/tags", body);
    return data;
  },

  async update(id: string, body: UpdateTagBody): Promise<Tag> {
    const { data } = await api.patch<Tag>(`/cms/tags/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/cms/tags/${id}`);
  },

  // Moves source's article links onto target and deletes source (transactional +
  // dedupe, server-side). Returns the surviving target tag.
  async merge(body: MergeTagsBody): Promise<Tag> {
    const { data } = await api.post<Tag>("/cms/tags/merge", body);
    return data;
  },
};
