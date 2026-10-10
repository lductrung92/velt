import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Role pill with a stable, dark-mode-aware hue per well-known role code.
// Unknown roles fall back to neutral. docs/styles/console status-badge §4.
const ROLE_CLASS: Record<string, string> = {
  super_admin:
    "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  admin:
    "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  editor:
    "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const FALLBACK = "border-border bg-muted text-muted-foreground";

export function RoleBadge({ code, name }: { code: string; name: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", ROLE_CLASS[code] ?? FALLBACK)}
    >
      {name}
    </Badge>
  );
}
