import api from "@/services/api";
import type { PageSEO } from "@/modules/cms/services/pages.service";

// Mirrors the Go backend exactly (contract-first, docs/apis/products-api.md §2 +
// backend/internal/modules/products/catalog).

/** Publication axis — who can see the row at all. */
export type ProductStatus = "draft" | "published" | "archived";
/** Lifecycle axis — what the page says about the product. Independent of
 *  status: a published product can still be an idea (docs §3). */
export type ProductLifecycle = "idea" | "building" | "launched";

export const PRODUCT_STATUSES: ProductStatus[] = [
  "draft",
  "published",
  "archived",
];
export const PRODUCT_LIFECYCLES: ProductLifecycle[] = [
  "idea",
  "building",
  "launched",
];
export const PRODUCT_AUDIENCES = ["individual", "team", "business"] as const;
export const PRODUCT_PLATFORMS = ["web", "ios", "android", "desktop"] as const;

// The SEO block is the same shape the CMS pages use, so the same helpers serve
// it unchanged; og_path is products-only and lives beside it.
export type ProductSEO = PageSEO & { og_path?: string | null };

export type TiptapDoc = Record<string, unknown>;

export interface ProductCategoryRef {
  id: string;
  slug: string;
  name: string;
}

/** A member as seen from a product. `role` is the role they played on THIS
 *  product; empty means the site falls back to their general role. */
export interface ProductMemberRef {
  id: string;
  slug: string;
  full_name: string;
  role: string | null;
  avatar_url: string | null;
  sort_order: number;
}

/** One gallery entry: an uploaded image OR an embedded video, never both. */
/**
 * Which device tab a gallery entry belongs to. Null means nobody has said yet.
 *
 * A laptop and a desktop monitor share `desktop`: both show the wide layout,
 * and a team does not capture the same screen twice to fill two tabs that
 * would look alike.
 */
export type MediaDevice = "phone" | "tablet" | "desktop";
export const MEDIA_DEVICES: MediaDevice[] = ["phone", "tablet", "desktop"];

export interface ProductMedia {
  id: string;
  kind: "image" | "video";
  url: string | null;
  video_url: string | null;
  caption: string | null;
  device: MediaDevice | null;
  /** The capture the product page's hero shows for that device. */
  is_hero: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  cover_url: string | null;
  status: ProductStatus;
  lifecycle: ProductLifecycle;
  version: string | null;
  released_at: string | null;
  is_featured: boolean;
  sort_order: number;
  updated_at: string;
  published_at: string | null;
}

export interface Product extends Omit<ProductListItem, "published_at"> {
  body_html: string | null;
  body_json: TiptapDoc | null;
  cover_path: string | null;
  audience: string[];
  platforms: string[];
  tech_stack: string[];
  highlights: string[];
  product_url: string | null;
  demo_url: string | null;
  demo_access: string | null;
  demo_instructions: string[];
  seo: ProductSEO;
  // Always present (possibly empty): the client never has to tell "none" from
  // "not loaded".
  categories: ProductCategoryRef[];
  members: ProductMemberRef[];
  gallery: ProductMedia[];
  published_at: string | null;
  created_at: string;
}

export interface ProductListParams {
  q?: string;
  status?: ProductStatus | "";
  lifecycle?: ProductLifecycle | "";
  platform?: string;
  audience?: string;
  featured?: boolean;
  /** name | updated_at | released_at | sort_order ("-" prefix = desc). */
  sort?: string;
  page?: number;
  page_size?: number;
  /** ISO day (YYYY-MM-DD), Vietnam time; the whole `created_to` day counts. */
  created_from?: string;
  created_to?: string;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateProductBody {
  name: string;
  slug?: string;
  summary?: string;
  body_html?: string;
  body_json?: TiptapDoc | null;
  lifecycle?: ProductLifecycle;
  version?: string;
  released_at?: string;
  audience?: string[];
  platforms?: string[];
  tech_stack?: string[];
  highlights?: string[];
  is_featured?: boolean;
  sort_order?: number;
  product_url?: string;
  demo_url?: string;
  demo_access?: string;
  demo_instructions?: string[];
  seo?: ProductSEO;
}

// PATCH semantics: an omitted key keeps the current value, an empty string
// clears the field. `status` is absent on purpose — it moves only through the
// publish/unpublish/archive endpoints, which carry their own permission.
export type UpdateProductBody = Partial<CreateProductBody> & {
  cover_path?: string;
};

export interface UploadResult {
  path: string;
  url: string;
}

export const productsService = {
  async list(params: ProductListParams): Promise<ProductListResult> {
    const { data } = await api.get<ProductListResult>("/products", { params });
    return data;
  },

  async get(id: string): Promise<Product> {
    const { data } = await api.get<Product>(`/products/${id}`);
    return data;
  },

  async create(body: CreateProductBody): Promise<Product> {
    const { data } = await api.post<Product>("/products", body);
    return data;
  },

  async update(id: string, body: UpdateProductBody): Promise<Product> {
    const { data } = await api.patch<Product>(`/products/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },

  // purpose doubles as the stored filename prefix (cover | og | inline).
  async upload(
    id: string,
    file: File | Blob,
    purpose: "cover" | "og" | "inline" = "cover",
  ): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file);
    // The axios instance defaults to application/json; FormData needs the
    // override or the server never sees a multipart body.
    const { data } = await api.post<UploadResult>(
      `/products/${id}/upload?purpose=${purpose}`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  },

  // Each of these replaces the whole set; the server rewrites sort_order from
  // the array order, so the client never computes it.
  async setCategories(
    id: string,
    categoryIds: string[],
  ): Promise<ProductCategoryRef[]> {
    const { data } = await api.put<{ categories: ProductCategoryRef[] }>(
      `/products/${id}/categories`,
      { category_ids: categoryIds },
    );
    return data.categories;
  },

  async setMembers(
    id: string,
    members: { member_id: string; role?: string }[],
  ): Promise<ProductMemberRef[]> {
    const { data } = await api.put<{ members: ProductMemberRef[] }>(
      `/products/${id}/members`,
      { members },
    );
    return data.members;
  },

  async addGalleryImage(
    id: string,
    file: File | Blob,
    caption?: string,
    device?: MediaDevice | null,
  ): Promise<ProductMedia> {
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    if (device) form.append("device", device);
    const { data } = await api.post<ProductMedia>(
      `/products/${id}/media`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  },

  // Only YouTube and Vimeo are accepted — the URL goes into an <iframe> on the
  // public site, so the backend keeps a host allowlist.
  async addGalleryVideo(
    id: string,
    videoUrl: string,
    caption?: string,
    device?: MediaDevice | null,
  ): Promise<ProductMedia> {
    const { data } = await api.post<ProductMedia>(
      `/products/${id}/media/video`,
      {
        video_url: videoUrl,
        caption,
        device: device ?? null,
      },
    );
    return data;
  },

  /**
   * Edits what describes one entry. The request carries the WHOLE editable
   * state — the API clears a field left out — so both travel together even
   * when only one of them changed.
   */
  async updateGalleryItem(
    id: string,
    mediaId: string,
    patch: {
      caption: string | null;
      device: MediaDevice | null;
      /** Omitted leaves the hero flag as it is. */
      is_hero?: boolean;
    },
  ): Promise<ProductMedia> {
    const { data } = await api.patch<ProductMedia>(
      `/products/${id}/media/${mediaId}`,
      {
        caption: patch.caption || null,
        device: patch.device,
        ...(patch.is_hero === undefined ? {} : { is_hero: patch.is_hero }),
      },
    );
    return data;
  },

  async removeGalleryItem(id: string, mediaId: string): Promise<void> {
    await api.delete(`/products/${id}/media/${mediaId}`);
  },

  async reorderGallery(id: string, ids: string[]): Promise<ProductMedia[]> {
    const { data } = await api.put<{ items: ProductMedia[] }>(
      `/products/${id}/media/order`,
      { ids },
    );
    return data.items;
  },

  async publish(id: string): Promise<Product> {
    const { data } = await api.post<Product>(`/products/${id}/publish`);
    return data;
  },

  async unpublish(id: string): Promise<Product> {
    const { data } = await api.post<Product>(`/products/${id}/unpublish`);
    return data;
  },

  async archive(id: string): Promise<Product> {
    const { data } = await api.post<Product>(`/products/${id}/archive`);
    return data;
  },
};
