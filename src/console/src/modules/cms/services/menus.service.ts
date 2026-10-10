import api from "@/services/api";

// Mirrors the Go backend exactly (backend/internal/modules/cms models_menus.go).
// A menu is a navigation slot (`location` UNIQUE) holding a nested item tree.
// Items have NO per-item endpoint — the whole tree is replaced via PUT /items.

// link_type CHECK (cms_menu_items): internal/external use `url`;
// article/page/category use `target_id` (polymorphic, resolved at public API).
export type MenuLinkType =
  | "internal"
  | "external"
  | "article"
  | "page"
  | "category";

export const MENU_LINK_TYPES: MenuLinkType[] = [
  "internal",
  "external",
  "article",
  "page",
  "category",
];

// A navigation slot (the list shape — no items).
export interface MenuSlot {
  id: string;
  name: string;
  location: string;
  created_at: string;
  updated_at: string;
}

// A node in the detail item tree (GET /{id} + PUT items return).
export interface MenuItemNode {
  id: string;
  label: string;
  link_type: MenuLinkType;
  target_id: string | null;
  url: string | null;
  open_new_tab: boolean;
  sort_order: number;
  children: MenuItemNode[];
}

// Slot + its item tree.
export interface MenuDetail extends MenuSlot {
  items: MenuItemNode[];
}

export interface CreateMenuBody {
  name: string;
  location: string;
}

// PATCH sends only changed fields.
export interface UpdateMenuBody {
  name?: string;
  location?: string;
}

// One node in the PUT /items whole-tree replace. No `id`/`sort_order` — the
// backend recreates the tree and assigns sort_order from slice order.
export interface MenuItemInput {
  label: string;
  link_type: MenuLinkType;
  target_id: string | null;
  url: string | null;
  open_new_tab: boolean;
  children: MenuItemInput[];
}

export interface MenuItemsBody {
  items: MenuItemInput[];
}

export const menusService = {
  async list(): Promise<MenuSlot[]> {
    const { data } = await api.get<MenuSlot[]>("/cms/menus");
    return data;
  },

  async get(id: string): Promise<MenuDetail> {
    const { data } = await api.get<MenuDetail>(`/cms/menus/${id}`);
    return data;
  },

  async create(body: CreateMenuBody): Promise<MenuSlot> {
    const { data } = await api.post<MenuSlot>("/cms/menus", body);
    return data;
  },

  async update(id: string, body: UpdateMenuBody): Promise<MenuSlot> {
    const { data } = await api.patch<MenuSlot>(`/cms/menus/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/cms/menus/${id}`);
  },

  async replaceItems(id: string, body: MenuItemsBody): Promise<MenuDetail> {
    const { data } = await api.put<MenuDetail>(`/cms/menus/${id}/items`, body);
    return data;
  },
};
