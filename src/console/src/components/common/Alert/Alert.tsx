import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Inline alert for view-level feedback (form errors, notices). Token-driven
// colours with a per-variant leading icon. `message` is a convenience for the
// common single-string case; `children` allows rich content.
export type AlertVariant = "danger" | "success" | "warning" | "info";

const VARIANT_STYLE: Record<AlertVariant, string> = {
  danger:
    "border-destructive/40 bg-destructive/10 text-destructive-ink [&>svg]:text-destructive-ink",
  success:
    "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200 [&>svg]:text-emerald-600",
  warning:
    "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 [&>svg]:text-amber-600",
  info: "border-primary/40 bg-primary/10 text-foreground [&>svg]:text-primary-ink",
};

const VARIANT_ICON: Record<AlertVariant, typeof AlertCircle> = {
  danger: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

interface AlertProps {
  variant?: AlertVariant;
  /** Convenience: render a single string as the body. */
  message?: string;
  children?: ReactNode;
  icon?: boolean;
  className?: string;
}

export function Alert({
  variant = "danger",
  message,
  children,
  icon = true,
  className,
}: AlertProps) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        VARIANT_STYLE[variant],
        className,
      )}
    >
      {icon && <Icon className="mt-0.5 size-5 shrink-0" />}
      <div className="min-w-0 flex-1">{message ?? children}</div>
    </div>
  );
}
