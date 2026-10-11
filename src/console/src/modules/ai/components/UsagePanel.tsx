import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { UsageReport } from "../services/ai.service";

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact" });

// Spend against the ceiling.
//
// This panel is the reason the screen is worth building at all: the daily cap
// silently degrades the assistant to scripted replies when it is hit, and a
// ceiling nobody can see is not a ceiling.
export function UsagePanel({ usage }: { usage: UsageReport }) {
  const { t } = useTranslation();
  const cap = usage.daily_cap;
  const used = usage.today_tokens_out;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const near = cap > 0 && pct >= 80;

  // A bar chart is overkill for fourteen numbers; sparklines of relative
  // height read fine and cost nothing.
  const peak = Math.max(1, ...usage.days.map((d) => d.tokens_out));

  return (
    <div className="space-y-4" data-testid="ai-usage">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{t("ai.usage.today")}</span>
          <span className="font-mono">
            {compact.format(used)}
            {cap > 0 && (
              <span className="text-muted-foreground"> / {compact.format(cap)}</span>
            )}
          </span>
        </div>
        {cap > 0 ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                data-testid="ai-usage-bar"
                className={cn(
                  "h-full rounded-full transition-all",
                  near ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {near && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("ai.usage.near_cap")}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("ai.usage.no_cap")}</p>
        )}
      </div>

      {usage.days.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ai.usage.empty")}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("ai.usage.history")}
          </p>
          <ul className="space-y-1">
            {usage.days.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 font-mono text-muted-foreground">
                  {d.day.slice(5)}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/60"
                    style={{ width: `${Math.round((d.tokens_out / peak) * 100)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono">
                  {compact.format(d.tokens_out)}
                </span>
                <span className="w-24 shrink-0 text-right text-muted-foreground">
                  {t("ai.usage.conversations", { count: d.conversations })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
