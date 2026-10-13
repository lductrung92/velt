import { Loader2, PlugZap, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert } from "@/components/common/Alert";
import { PageHeader } from "@/components/common/PageHeader";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/modules/auth";
import { parseApiError } from "@/utils/apiError";

import { AiStatusStrip } from "../components/AiStatusStrip";
import { McpTokensPanel } from "../components/McpTokensPanel";
import { UsagePanel } from "../components/UsagePanel";
import {
  useAiModels,
  useAiSettings,
  useAiStatus,
  useAiUsage,
  useSaveAiSettings,
  useTestAi,
} from "../hooks/useAi";
import type { AiSettings, ProviderKind, TestResult } from "../services/ai.service";

// The assistant's admin surface: is it running, what is it costing, does the
// model actually work, and which agents may act on our behalf.
//
// Deliberately NOT every ai.* setting. `ai.max_message_len` and the per-request
// sampling knobs are engineering guards nobody tunes meaningfully — putting
// them here would only add noise and a way to break things.
export default function AiAssistant({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("settings.manage");

  const status = useAiStatus();
  const usage = useAiUsage(14);
  const settings = useAiSettings();
  const save = useSaveAiSettings();
  const test = useTestAi();
  const models = useAiModels();

  const [form, setForm] = useState<Partial<AiSettings>>({});
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (settings.data) setForm(settings.data.values);
  }, [settings.data]);

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const provider = (form["ai.provider"] ?? "anthropic") as ProviderKind;
  const keyIsSet = settings.data?.keyIsSet ?? false;

  const onSave = () => {
    // Omit the key unless one was typed: sending "" would CLEAR a working
    // credential, which is the opposite of leaving a field alone.
    const updates: Partial<AiSettings> = { ...form };
    if (apiKey.trim()) updates["ai.api_key"] = apiKey.trim();
    save.mutate(updates, {
      onSuccess: () => {
        setApiKey("");
        toast.success(t("ai.saved"));
      },
      onError: (err) => toast.error(parseApiError(err, t).message),
    });
  };

  if (settings.isLoading || status.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (settings.isError || status.isError) {
    return (
      <Alert
        variant="danger"
        message={parseApiError(settings.error ?? status.error, t).message}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Embedded inside the settings screen, the page already has a header;
          standing on its own route it still needs one. */}
      {!embedded && <PageHeader title={t("ai.title")} subtitle={t("ai.subtitle")} />}

      {status.data && <AiStatusStrip status={status.data} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("ai.section.connection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  {/* htmlFor rather than aria-label: a button is a labelable
                      element, so the label becomes clickable too. */}
                  <Label htmlFor="ai-enabled">{t("ai.field.enabled")}</Label>
                  <Switch
                    id="ai-enabled"
                    checked={Boolean(form["ai.enabled"])}
                    disabled={!canManage}
                    onCheckedChange={(v) => set("ai.enabled", v)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("ai.field.enabled_hint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block" htmlFor="ai-provider">
                  {t("ai.field.provider")}
                </Label>
                <Select
                  inputId="ai-provider"
                  isDisabled={!canManage}
                  value={{ value: provider, label: t(`ai.provider.${provider}`) }}
                  options={(["anthropic", "openai"] as ProviderKind[]).map((p) => ({
                    value: p,
                    label: t(`ai.provider.${p}`),
                  }))}
                  onChange={(o) => o && set("ai.provider", o.value as ProviderKind)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ai.field.provider_hint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block" htmlFor="ai-base-url">
                  {t("ai.field.base_url")}
                </Label>
                <Input
                  id="ai-base-url"
                  value={form["ai.base_url"] ?? ""}
                  disabled={!canManage}
                  placeholder={
                    provider === "openai"
                      ? "http://localhost:11434/v1"
                      : "https://api.anthropic.com"
                  }
                  onChange={(e) => set("ai.base_url", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ai.field.base_url_hint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block" htmlFor="ai-key">
                  {t("ai.field.api_key")}
                </Label>
                <Input
                  id="ai-key"
                  type="password"
                  value={apiKey}
                  disabled={!canManage}
                  autoComplete="off"
                  placeholder={
                    keyIsSet ? t("ai.field.api_key_set") : t("ai.field.api_key_unset")
                  }
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ai.field.api_key_hint")}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-end justify-between gap-2">
                  <Label className="block" htmlFor="ai-model">
                    {t("ai.field.model")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={models.isPending}
                    onClick={() =>
                      models.mutate(undefined, {
                        onSuccess: (res) => {
                          if (res.error) toast.error(res.error);
                          else if (res.items.length === 0) toast.info(t("ai.models.empty"));
                        },
                        onError: (err) => toast.error(parseApiError(err, t).message),
                      })
                    }
                  >
                    {models.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    {t("ai.models.fetch")}
                  </Button>
                </div>
                {/* Free text with a suggestion list, not a dropdown: model ids
                    on OpenAI-compatible endpoints are arbitrary. */}
                <Input
                  id="ai-model"
                  list="ai-model-options"
                  value={form["ai.model"] ?? ""}
                  disabled={!canManage}
                  placeholder="claude-sonnet-5-5"
                  onChange={(e) => set("ai.model", e.target.value)}
                />
                <datalist id="ai-model-options">
                  {(models.data?.items ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" disabled={!canManage || save.isPending} onClick={onSave}>
                  <Save className="size-4" />
                  {t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canManage || test.isPending}
                  onClick={() =>
                    test.mutate(undefined, {
                      onSuccess: setResult,
                      onError: (err) => toast.error(parseApiError(err, t).message),
                    })
                  }
                >
                  {test.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  {t("ai.test.run")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("ai.test.costs")}
                </span>
              </div>

              {result && <TestOutcome result={result} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("ai.section.behaviour")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="block" htmlFor="ai-persona">
                  {t("ai.field.persona")}
                </Label>
                <Textarea
                  id="ai-persona"
                  rows={4}
                  maxLength={2000}
                  disabled={!canManage}
                  value={form["ai.system_persona"] ?? ""}
                  onChange={(e) => set("ai.system_persona", e.target.value)}
                />
                {/* Says plainly that this ADDS to the brief. The safety rules
                    (no price, no legal advice) are not editable from here. */}
                <p className="text-xs text-muted-foreground">
                  {t("ai.field.persona_hint")}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="block" htmlFor="ai-cap">
                    {t("ai.field.daily_cap")}
                  </Label>
                  <Input
                    id="ai-cap"
                    type="number"
                    min={0}
                    disabled={!canManage}
                    value={form["ai.daily_token_cap"] ?? 0}
                    onChange={(e) => set("ai.daily_token_cap", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ai.field.daily_cap_hint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="block" htmlFor="ai-turns">
                    {t("ai.field.max_turns")}
                  </Label>
                  <Input
                    id="ai-turns"
                    type="number"
                    min={1}
                    disabled={!canManage}
                    value={form["ai.max_turns"] ?? 30}
                    onChange={(e) => set("ai.max_turns", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ai.field.max_turns_hint")}
                  </p>
                </div>
              </div>

              <Button type="button" disabled={!canManage || save.isPending} onClick={onSave}>
                <Save className="size-4" />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("ai.section.usage")}</CardTitle>
            </CardHeader>
            <CardContent>
              {usage.data ? (
                <UsagePanel usage={usage.data} />
              ) : (
                <Skeleton className="h-40 w-full" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("ai.section.mcp")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("ai.mcp.intro")}</p>
              <McpTokensPanel canManage={canManage} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// The test result. Tool calling gets its own line because it is the part that
// breaks the grounding guarantee rather than merely lowering quality: without
// it the assistant answers from imagination instead of the catalog.
function TestOutcome({ result }: { result: TestResult }) {
  const { t } = useTranslation();
  if (!result.ok) {
    return (
      <Alert variant="danger" message={result.error || t("ai.test.failed")} />
    );
  }
  if (!result.tool_calling) {
    return (
      <Alert variant="warning">
        <p>{t("ai.test.no_tools")}</p>
        <p className="mt-1 text-xs">
          {t("ai.test.latency", { ms: result.latency_ms })}
        </p>
      </Alert>
    );
  }
  return (
    <Alert variant="success">
      <p>{t("ai.test.passed")}</p>
      <p className="mt-1 text-xs">
        {t("ai.test.latency", { ms: result.latency_ms })}
      </p>
    </Alert>
  );
}
