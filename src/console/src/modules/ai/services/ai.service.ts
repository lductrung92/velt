import api from "@/services/api";

// Mirrors backend/internal/modules/ai (conversation/admin.go) and the MCP
// token store. The API key is never readable: the settings endpoint reports
// only whether one is set.

export type ProviderKind = "anthropic" | "openai";

/** Why the assistant is not answering. Distinct on purpose — "off",
 *  "misconfigured" and "out of money" call for different actions. */
export type StatusReason = "" | "disabled" | "not_configured" | "budget_exhausted";

export interface AiStatus {
  live: boolean;
  reason: StatusReason;
  provider: ProviderKind;
  model: string;
  base_url: string;
  has_key: boolean;
  staff_online: number;
}

export interface UsageDay {
  day: string;
  conversations: number;
  tokens_in: number;
  tokens_out: number;
}

export interface UsageReport {
  today_tokens_out: number;
  daily_cap: number;
  days: UsageDay[];
}

export interface TestResult {
  ok: boolean;
  /** The one that matters: without tool calling the assistant answers from
   *  imagination instead of the catalog. */
  tool_calling: boolean;
  model: string;
  provider: ProviderKind;
  latency_ms: number;
  reply?: string;
  error?: string;
}

export interface McpToken {
  id: string;
  user_id: string;
  label: string;
  hint: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** Null only for tokens issued before expiry existed; those never expire. */
  expires_at: string | null;
  created_at: string;
}

export interface IssuedToken {
  token: McpToken;
  /** Returned exactly once, at creation, and unrecoverable afterwards. */
  secret: string;
  shown_once: boolean;
}

/** The subset of settings this screen owns. */
export interface AiSettings {
  "ai.enabled": boolean;
  "ai.provider": ProviderKind;
  "ai.base_url": string;
  "ai.model": string;
  "ai.daily_token_cap": number;
  "ai.max_turns": number;
  "ai.system_persona": string;
  /** Write-only. Send a value to replace it; omit to leave it alone. */
  "ai.api_key"?: string;
}

export const aiService = {
  async status(): Promise<AiStatus> {
    const { data } = await api.get<AiStatus>("/ai/status");
    return data;
  },

  async usage(days = 14): Promise<UsageReport> {
    const { data } = await api.get<UsageReport>(`/ai/usage?days=${days}`);
    return data;
  },

  // Not every endpoint lists its models, so a failure comes back as data and
  // the model field stays usable by hand.
  async models(): Promise<{ items: string[]; error?: string }> {
    const { data } = await api.get<{ items: string[]; error?: string }>("/ai/models");
    return data;
  },

  async test(): Promise<TestResult> {
    const { data } = await api.post<TestResult>("/ai/test");
    return data;
  },

  // --- settings ---

  async read(): Promise<{ values: Partial<AiSettings>; keyIsSet: boolean }> {
    const { data } = await api.get<unknown>("/settings");
    const values: Record<string, unknown> = {};
    let keyIsSet = false;
    // The settings endpoint groups keys; walk it rather than assuming a shape
    // that another module owns.
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      const row = node as Record<string, unknown>;
      if (typeof row.key === "string" && row.key.startsWith("ai.")) {
        if (row.key === "ai.api_key") keyIsSet = row.is_set === true;
        else values[row.key] = row.value;
      }
      Object.values(row).forEach(walk);
    };
    walk(data);
    return { values: values as Partial<AiSettings>, keyIsSet };
  },

  async save(updates: Partial<AiSettings>): Promise<void> {
    await api.put("/settings", { updates });
  },

  // --- MCP tokens ---

  async listTokens(): Promise<McpToken[]> {
    const { data } = await api.get<{ items: McpToken[] }>("/mcp/tokens");
    return data.items;
  },

  async issueToken(label: string): Promise<IssuedToken> {
    const { data } = await api.post<IssuedToken>("/mcp/tokens", { label });
    return data;
  },

  async revokeToken(id: string): Promise<void> {
    await api.delete(`/mcp/tokens/${id}`);
  },
};
