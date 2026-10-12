import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  leadsService,
  type LeadListParams,
  type LeadUpdate,
} from "../services/leads.service";

export const leadKeys = {
  all: ["leads"] as const,
  list: (p: LeadListParams) => [...leadKeys.all, "list", p] as const,
  detail: (id: string) => [...leadKeys.all, "detail", id] as const,
};

export function useLeads(params: LeadListParams) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: () => leadsService.list(params),
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: leadKeys.detail(id ?? ""),
    queryFn: () => leadsService.get(id as string),
    enabled: !!id,
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LeadUpdate }) =>
      leadsService.update(id, body),
    // A status change moves the row in every filtered list, so refresh them all
    // rather than guessing which one the user is looking at.
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}
