import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// List-screen action bar (above the table). Desktop: primary actions left,
// filter trigger + refresh right; wraps on mobile.
export function ListToolbar({
  children,
  filter,
  onRefresh,
  refreshDisabled,
  className,
}: {
  /** Left slot — primary actions (e.g. the "+ New" button). */
  children?: ReactNode;
  /** Right slot — typically a <FilterPopover> (renders its own trigger). */
  filter?: ReactNode;
  /** Refetch the current list (renders a Refresh icon button). */
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {(filter || onRefresh) && (
        <div className="flex items-center gap-2 sm:ml-auto">
          {filter}
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={refreshDisabled}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
            >
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
