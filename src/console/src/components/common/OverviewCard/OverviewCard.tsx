import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Stat card: tinted icon tile + value + label. Degrades to "—" on error so one
// failing count never sinks the whole grid (docs/styles/console/layout §7).
export function OverviewCard({
  icon: Icon,
  label,
  value,
  loading = false,
  error = false,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  loading?: boolean;
  error?: boolean;
  /** Screen this count belongs to. Turns the whole card into its entry point. */
  to?: string;
}) {
  const body = (
    <>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-10 w-12" />
        ) : (
          <div className="text-4xl font-medium tabular-nums tracking-tight">
            {error ? "—" : value}
          </div>
        )}
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </>
  );

  const shell = "flex items-center gap-4 rounded-md border bg-card p-5";
  if (!to) return <div className={shell}>{body}</div>;
  return (
    <Link
      to={to}
      className={cn(
        shell,
        "transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {body}
    </Link>
  );
}
