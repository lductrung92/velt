import { CheckCircle2, CircleSlash, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { AiStatus } from "../services/ai.service";

// The strip that answers the only question this screen really exists for: is
// the assistant answering customers right now, and if not, why not.
//
// It is here because the failure this guards against is SILENT — a wrong key
// or an exhausted budget looks exactly like a working configuration, and the
// first symptom is a customer getting scripted replies.
export function AiStatusStrip({ status }: { status: AiStatus }) {
  const { t } = useTranslation();
  const live = status.live;

  return (
    <div
      data-testid="ai-status-strip"
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3",
        live
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
          : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
      )}
    >
      <div className="flex items-center gap-2">
        {live ? (
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleSlash className="size-4 text-amber-600 dark:text-amber-400" />
        )}
        <span className="font-medium">
          {live ? t("ai.status.live") : t("ai.status.degraded")}
        </span>
        {!live && status.reason && (
          <span className="text-sm text-muted-foreground">
            — {t(`ai.status.reason.${status.reason}`)}
          </span>
        )}
      </div>

      <span className="text-sm text-muted-foreground">
        {t(`ai.provider.${status.provider}`)} · {status.model || "—"}
      </span>

      {/* Explains a refused handoff without anyone having to guess. */}
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="size-3.5" />
        {t("ai.status.staff_online", { count: status.staff_online })}
      </span>
    </div>
  );
}
