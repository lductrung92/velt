import api from "@/services/api";

import { type PageSEO } from "./pages.service";

// CMS landing-page builder client. Mirrors backend cms/landing: a landing page
// (key/name/SEO) owns an ordered list of typed sections. config is opaque JSON,
// validated/sanitized per type on the backend. A landing is attached to a CMS
// page (page.landing_id) to render on the public site.

export type LandingStatus = "draft" | "published";

// The 14 builder section types (matches the backend enum). Config shape per type
// is the shared contract in docs/specs/cms-landing-page.md §4.
export const SECTION_TYPES = [
  "hero",
  "slider",
  "featured_articles",
  "categories_showcase",
  "rich_text",
  "cta_banner",
  "testimonials",
  "logos",
  "stats",
  "media_text",
  "newsletter",
  "faq",
  "gallery",
  "html_embed",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export type SectionConfig = Record<string, unknown>;

export interface LandingSection {
  id: string;
  type: SectionType;
  sort_order: number;
  is_visible: boolean;
  config: SectionConfig;
}

// List/detail share these landing-level fields (og_url is the resolved media URL).
export interface LandingListItem {
  id: string;
  key: string;
  name: string;
  status: LandingStatus;
  og_url: string | null;
  seo: PageSEO;
  created_at: string;
  updated_at: string;
}

export interface LandingDetail extends LandingListItem {
  sections: LandingSection[];
}

export interface CreateLandingBody {
  key: string;
  name: string;
  og_path?: string | null;
  seo?: PageSEO;
}

export interface UpdateLandingBody {
  updated_at: string; // optimistic-lock token
  key?: string;
  name?: string;
  og_path?: string | null;
  seo?: PageSEO;
}

export interface CreateSectionBody {
  type: SectionType;
  config?: SectionConfig;
  is_visible?: boolean;
}

export interface UpdateSectionBody {
  config?: SectionConfig;
  is_visible?: boolean;
}

export interface UploadMediaResult {
  path: string;
  url: string;
}

export const landingService = {
  async list(): Promise<LandingListItem[]> {
    const { data } = await api.get<LandingListItem[]>("/cms/landing");
    return data;
  },
  async get(id: string): Promise<LandingDetail> {
    const { data } = await api.get<LandingDetail>(`/cms/landing/${id}`);
    return data;
  },
  async create(body: CreateLandingBody): Promise<LandingListItem> {
    const { data } = await api.post<LandingListItem>("/cms/landing", body);
    return data;
  },
  async update(id: string, body: UpdateLandingBody): Promise<LandingListItem> {
    const { data } = await api.patch<LandingListItem>(`/cms/landing/${id}`, body);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/cms/landing/${id}`);
  },
  async publish(id: string): Promise<LandingDetail> {
    const { data } = await api.post<LandingDetail>(`/cms/landing/${id}/publish`);
    return data;
  },
  async unpublish(id: string): Promise<LandingDetail> {
    const { data } = await api.post<LandingDetail>(`/cms/landing/${id}/unpublish`);
    return data;
  },
  async createSection(
    landingId: string,
    body: CreateSectionBody,
  ): Promise<LandingDetail> {
    const { data } = await api.post<LandingDetail>(
      `/cms/landing/${landingId}/sections`,
      body,
    );
    return data;
  },
  async updateSection(
    sectionId: string,
    body: UpdateSectionBody,
  ): Promise<LandingDetail> {
    const { data } = await api.patch<LandingDetail>(
      `/cms/landing/sections/${sectionId}`,
      body,
    );
    return data;
  },
  async deleteSection(sectionId: string): Promise<void> {
    await api.delete(`/cms/landing/sections/${sectionId}`);
  },
  async reorderSections(
    landingId: string,
    sectionIds: string[],
  ): Promise<LandingDetail> {
    const { data } = await api.put<LandingDetail>(
      `/cms/landing/${landingId}/sections/order`,
      { section_ids: sectionIds },
    );
    return data;
  },
  async uploadMedia(landingId: string, file: File): Promise<UploadMediaResult> {
    const fd = new FormData();
    fd.append("file", file);
    // Override the instance's application/json default so axios sends multipart.
    const { data } = await api.post<UploadMediaResult>(
      `/cms/landing/${landingId}/upload`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  },
};
