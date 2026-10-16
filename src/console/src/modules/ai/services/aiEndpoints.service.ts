import api from "@/services/api";

/** One configured LLM endpoint. The key never comes back — only whether one
 *  is stored, which is all a screen needs to show. */
export interface AiProvider {
  id: string;
  label: string;
  kind: "anthropic" | "openai";
  base_url: string;
  has_key: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** One link of a purpose's chain: an endpoint running a model. */
export interface AiChainStep {
  id: string;
  purpose: AiPurpose;
  provider_id: string;
  provider_label: string;
  provider_enabled: boolean;
  model: string;
  sort_order: number;
}

/** The jobs a chain can be configured for. */
export type AiPurpose = "chat" | "content";

export const AI_PURPOSES: AiPurpose[] = ["chat", "content"];

export interface CreateProviderBody {
  label: string;
  kind: AiProvider["kind"];
  base_url?: string;
  /** Omit to leave the stored key alone; "" clears it. */
  api_key?: string;
  enabled?: boolean;
}

export type UpdateProviderBody = Partial<CreateProviderBody>;

export const aiEndpointsService = {
  async providers(): Promise<AiProvider[]> {
    const { data } = await api.get<{ items: AiProvider[] }>("/ai/providers");
    return data.items;
  },

  async createProvider(body: CreateProviderBody): Promise<AiProvider> {
    const { data } = await api.post<AiProvider>("/ai/providers", body);
    return data;
  },

  async updateProvider(
    id: string,
    body: UpdateProviderBody,
  ): Promise<AiProvider> {
    const { data } = await api.patch<AiProvider>(`/ai/providers/${id}`, body);
    return data;
  },

  async deleteProvider(id: string): Promise<void> {
    await api.delete(`/ai/providers/${id}`);
  },

  async reorderProviders(ids: string[]): Promise<void> {
    await api.put("/ai/providers/order", { ids });
  },

  // An endpoint that cannot list its models answers with an error field rather
  // than a failed request: a key may simply not be saved yet, and the model
  // can still be typed by hand.
  async providerModels(
    id: string,
  ): Promise<{ items: string[]; error?: string }> {
    const { data } = await api.get<{ items: string[]; error?: string }>(
      `/ai/providers/${id}/models`,
    );
    return data;
  },

  async chain(purpose: AiPurpose): Promise<AiChainStep[]> {
    const { data } = await api.get<{ steps: AiChainStep[] }>(
      `/ai/chains/${purpose}`,
    );
    return data.steps;
  },

  // The array IS the priority, so the whole chain is replaced rather than
  // patched step by step.
  async setChain(
    purpose: AiPurpose,
    steps: { provider_id: string; model: string }[],
  ): Promise<AiChainStep[]> {
    const { data } = await api.put<{ steps: AiChainStep[] }>(
      `/ai/chains/${purpose}`,
      { steps },
    );
    return data.steps;
  },
};
