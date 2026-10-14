import api from "@/services/api";

// Mirrors the Go backend exactly (contract-first, docs/apis/products-api.md §4 +
// backend/internal/modules/members). The server returns `avatar_url` already
// built from the stored path; the storage key never reaches the client.
export interface MemberLink {
  label: string;
  url: string;
}

export interface Member {
  id: string;
  slug: string;
  full_name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  email: string | null;
  zalo: string | null;
  links: MemberLink[];
  skills: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberListParams {
  q?: string;
  /** true → only members shown on the public site. */
  active?: boolean;
  page?: number;
  page_size?: number;
  /** ISO day (YYYY-MM-DD), Vietnam time; the whole `created_to` day counts. */
  created_from?: string;
  created_to?: string;
}

export interface MemberListResult {
  items: Member[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateMemberBody {
  full_name: string;
  slug?: string;
  role?: string;
  bio?: string;
  email?: string;
  zalo?: string;
  links?: MemberLink[];
  skills?: string[];
  is_active?: boolean;
}

// PATCH semantics: an omitted key keeps the current value, an empty string
// clears the field. Mirrors the Go UpdateRequest (all-pointer struct).
export type UpdateMemberBody = Partial<CreateMemberBody>;

export const membersService = {
  async list(params: MemberListParams): Promise<MemberListResult> {
    const { data } = await api.get<MemberListResult>("/members", { params });
    return data;
  },

  async get(id: string): Promise<Member> {
    const { data } = await api.get<Member>(`/members/${id}`);
    return data;
  },

  async create(body: CreateMemberBody): Promise<Member> {
    const { data } = await api.post<Member>("/members", body);
    return data;
  },

  async update(id: string, body: UpdateMemberBody): Promise<Member> {
    const { data } = await api.patch<Member>(`/members/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/members/${id}`);
  },

  // Full id list in the desired display order; the server rewrites sort_order.
  async reorder(ids: string[]): Promise<void> {
    await api.put("/members/order", { ids });
  },

  async uploadAvatar(id: string, file: File | Blob): Promise<Member> {
    const form = new FormData();
    form.append("file", file);
    // The axios instance defaults to application/json; FormData needs the
    // override or the server never sees a multipart body.
    const { data } = await api.post<Member>(`/members/${id}/avatar`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async deleteAvatar(id: string): Promise<Member> {
    const { data } = await api.delete<Member>(`/members/${id}/avatar`);
    return data;
  },
};
