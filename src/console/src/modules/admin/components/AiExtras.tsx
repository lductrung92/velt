import { Activity, KeyRound, PlugZap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/modules/auth";
import {
  AiStatusStrip,
  McpTokensPanel,
  UsagePanel,
  useAiStatus,
  useAiUsage,
  useTestAi,
  type TestResult,
} from "@/modules/ai";

import { SettingsSection } from "./SettingsSection";

/**
 * The parts of the assistant that are not settings.
 *
 * Its connection can be tested and its spending can be read, and neither is a
 * value anybody types — but both belong beside the fields they describe rather
 * than on a screen of their own. They are wrapped in the same section card as
 * every other block here, so the AI tab reads like the rest of the screen
 * instead of like a different program.
 */
export function AiExtras() {
  const { t } = useTranslation();
  const { hasPermission } = usePermission();
  const canManage = hasPermission("settings.manage");
  const status = useAiStatus();
  const usage = useAiUsage(14);
  const test = useTestAi();
  const [result, setResult] = useState<TestResult | null>(null);

  return (
    <>
      <SettingsSection
        icon={PlugZap}
        title={t("settings.section.ai_check.title")}
        description={t("settings.section.ai_check.help")}
      >
        <div className="space-y-3 py-4 first:pt-1">
          {status.data && <AiStatusStrip status={status.data} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              loading={test.isPending}
              disabled={!canManage || test.isPending}
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: (r) => setResult(r),
                  onError: () => setResult({ ok: false } as TestResult),
                })
              }
            >
              <PlugZap className="size-4" />
              {t("ai.test.run")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("ai.test.costs")}
            </span>
          </div>
          {result && <TestOutcome result={result} />}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Activity}
        title={t("settings.section.ai_usage.title")}
        description={t("settings.section.ai_usage.help")}
      >
        <div className="py-4 first:pt-1">
          {usage.data ? (
            <UsagePanel usage={usage.data} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={KeyRound}
        title={t("settings.section.ai_mcp.title")}
        description={t("ai.mcp.intro")}
      >
        <div className="py-4 first:pt-1">
          <McpTokensPanel canManage={canManage} />
        </div>
      </SettingsSection>
    </>
  );
}

/**
 * The test result. Tool calling gets its own line because it is the part that
 * breaks the grounding guarantee rather than merely lowering quality: without
 * it the assistant answers from imagination instead of from the catalogue.
 */
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
