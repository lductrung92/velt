import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Status pill built on the Badge primitive. `tone` maps to a dark-mode-aware
// colour; text is passed in already-translated (statuses are domain-specific,
// so the label lives at the call site). docs/styles/console status-badge.
export type StatusTone = "success" | "neutral" | "warning" | "danger";

const TONE: Record<StatusTone, string> = {
  success:
    "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  neutral: "border-border bg-muted text-muted-foreground",
  warning:
    "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger:
    "border-destructive/30 bg-destructive/10 text-destructive-ink dark:bg-destructive/20",
};

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE[tone])}>
      {children}
    </Badge>
  );
}
