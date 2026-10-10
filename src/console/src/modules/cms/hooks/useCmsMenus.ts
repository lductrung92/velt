import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  menusService,
  type CreateMenuBody,
  type MenuItemsBody,
  type UpdateMenuBody,
} from "../services/menus.service";
import { cmsKeys } from "./cmsKeys";

export function useMenus() {
  return useQuery({
    queryKey: cmsKeys.menuList(),
    queryFn: () => menusService.list(),
  });
}

// Detail (slot + item tree) — dependent query, loaded only once a slot is picked.
export function useMenu(id: string | undefined) {
  return useQuery({
    queryKey: cmsKeys.menuDetail(id ?? ""),
    queryFn: () => menusService.get(id as string),
    enabled: !!id,
  });
}

export function useCreateMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMenuBody) => menusService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.menus() }),
  });
}

export function useUpdateMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMenuBody }) =>
      menusService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.menus() }),
  });
}

export function useDeleteMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => menusService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: cmsKeys.menus() }),
  });
}

// Whole-tree replace (PUT /items). On success the detail cache is refreshed so
// the builder rebases its baseline on the persisted tree.
export function useReplaceMenuItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MenuItemsBody }) =>
      menusService.replaceItems(id, body),
    onSuccess: (data) => qc.setQueryData(cmsKeys.menuDetail(data.id), data),
  });
}
