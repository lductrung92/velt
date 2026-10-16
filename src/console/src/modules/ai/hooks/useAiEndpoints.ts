import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  aiEndpointsService,
  type AiPurpose,
  type CreateProviderBody,
  type UpdateProviderBody,
} from "../services/aiEndpoints.service";
import { aiKeys } from "./useAi";

export const endpointKeys = {
  providers: () => [...aiKeys.all, "providers"] as const,
  providerModels: (id: string) =>
    [...aiKeys.all, "provider-models", id] as const,
  chain: (purpose: AiPurpose) => [...aiKeys.all, "chain", purpose] as const,
};

export function useAiProviders() {
  return useQuery({
    queryKey: endpointKeys.providers(),
    queryFn: () => aiEndpointsService.providers(),
  });
}

/** What one endpoint offers. Only asked for when a picker is actually open —
 *  it costs a round trip to the provider. */
export function useProviderModels(id: string | null) {
  return useQuery({
    queryKey: endpointKeys.providerModels(id ?? ""),
    queryFn: () => aiEndpointsService.providerModels(id as string),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useAiChain(purpose: AiPurpose) {
  return useQuery({
    queryKey: endpointKeys.chain(purpose),
    queryFn: () => aiEndpointsService.chain(purpose),
  });
}

/** Everything that writes invalidates the status strip too: adding or
 *  disabling an endpoint changes what the assistant would answer with. */
function useEndpointMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: endpointKeys.providers() });
      void qc.invalidateQueries({ queryKey: aiKeys.status() });
    },
  });
}

export function useCreateProvider() {
  return useEndpointMutation((body: CreateProviderBody) =>
    aiEndpointsService.createProvider(body),
  );
}

export function useUpdateProvider() {
  return useEndpointMutation(
    ({ id, body }: { id: string; body: UpdateProviderBody }) =>
      aiEndpointsService.updateProvider(id, body),
  );
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiEndpointsService.deleteProvider(id),
    onSuccess: () => {
      // Deleting an endpoint cascades its chain steps away, so every chain is
      // stale, not just the provider list.
      void qc.invalidateQueries({ queryKey: aiKeys.all });
    },
  });
}

export function useSetChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      purpose,
      steps,
    }: {
      purpose: AiPurpose;
      steps: { provider_id: string; model: string }[];
    }) => aiEndpointsService.setChain(purpose, steps),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: endpointKeys.chain(vars.purpose) });
      void qc.invalidateQueries({ queryKey: aiKeys.status() });
    },
  });
}
