import { cn } from "@/lib/utils";

// Loading placeholder. Mirror the shape of the content it stands in for
// (docs/styles/console/layout §4) — never a full-page spinner.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
