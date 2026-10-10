import api from "@/services/api";

// Mirrors the Go backend exactly (contract-first, backend/internal/modules/cms
// models.go CategoryResponse). `GET /cms/categories` returns the full tree as an
// array of roots with `children` nested — NOT paginated (taxonomy is small).
export interface CategorySEO {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
  article_count: number;
  seo: CategorySEO;
  children: Category[];
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryBody {
  name: string;
  slug?: string;
  // null / omitted = root node.
  parent_id?: string | null;
  description?: string;
  sort_order?: number;
  seo?: CategorySEO;
}

// PATCH sends only changed fields. `parent_id` follows the backend's Optional
// semantics: OMIT = leave unchanged · `null` = move to root · uuid = set parent.
// `updated_at` is the optimistic-lock token the client last read (required by the
// backend; a mismatch → 409 conflict).
export interface UpdateCategoryBody {
  name?: string;
  slug?: string;
  parent_id?: string | null;
  description?: string;
  sort_order?: number;
  seo?: CategorySEO;
  regenerate_slug?: boolean;
  updated_at: string;
}

export const categoriesService = {
  async list(): Promise<Category[]> {
    const { data } = await api.get<Category[]>("/cms/categories");
    return data;
  },

  async create(body: CreateCategoryBody): Promise<Category> {
    const { data } = await api.post<Category>("/cms/categories", body);
    return data;
  },

  async update(id: string, body: UpdateCategoryBody): Promise<Category> {
    const { data } = await api.patch<Category>(`/cms/categories/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/cms/categories/${id}`);
  },
};
