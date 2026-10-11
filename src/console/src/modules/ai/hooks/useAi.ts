import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aiService, type AiSettings } from "../services/ai.service";

export const aiKeys = {
  all: ["ai"] as const,
  status: () => [...aiKeys.all, "status"] as const,
  usage: (days: number) => [...aiKeys.all, "usage", days] as const,
  settings: () => [...aiKeys.all, "settings"] as const,
  models: () => [...aiKeys.all, "models"] as const,
  tokens: () => [...aiKeys.all, "tokens"] as const,
};

/** Status answers "is it running right now", so it is refetched on a timer
 *  rather than left stale — a budget can run out while the screen is open. */
export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: () => aiService.status(),
    refetchInterval: 30_000,
  });
}

export function useAiUsage(days = 14) {
  return useQuery({ queryKey: aiKeys.usage(days), queryFn: () => aiService.usage(days) });
}

export function useAiSettings() {
  return useQuery({ queryKey: aiKeys.settings(), queryFn: () => aiService.read() });
}

/** Models are fetched on demand, not on mount: it is a live call to the
 *  provider and most visits never need it. */
export function useAiModels() {
  return useMutation({ mutationFn: () => aiService.models() });
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<AiSettings>) => aiService.save(updates),
    // Status and usage both read these values, so neither may be left stale.
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.all }),
  });
}

export function useTestAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiService.test(),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.status() }),
  });
}

export function useMcpTokens() {
  return useQuery({ queryKey: aiKeys.tokens(), queryFn: () => aiService.listTokens() });
}

export function useIssueMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => aiService.issueToken(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.tokens() }),
  });
}

export function useRevokeMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiService.revokeToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.tokens() }),
  });
}
