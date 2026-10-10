import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

// Stat card: tinted icon tile + value + label. Degrades to "—" on error so one
// failing count never sinks the whole grid (docs/styles/console/layout §7).
export function OverviewCard({
  icon: Icon,
  label,
  value,
  loading = false,
  error = false,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-md border bg-card p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="text-3xl font-bold">{error ? "—" : value}</div>
        )}
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
