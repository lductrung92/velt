import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterChip {
  /** Stable key (the filter field name). */
  key: string;
  /** Short field label, e.g. "Vai trò". */
  label: string;
  /** The applied value, shown after the label. */
  value: string;
  /** Clear just this filter. */
  onRemove: () => void;
}

// "Filter info" row between toolbar and table: one chip per applied filter
// (`Label: value ✕`). Renders nothing when no filter is applied.
export function FilterChips({
  items,
  onClearAll,
  className,
}: {
  items: FilterChip[];
  onClearAll?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 rounded-md border bg-secondary/50 py-1 pl-2.5 pr-1 text-sm"
        >
          <span className="text-muted-foreground">{item.label}:</span>
          <span
            className="max-w-[100px] truncate font-medium"
            title={item.value}
          >
            {item.value}
          </span>
          <button
            type="button"
            onClick={item.onRemove}
            title={t("common.remove")}
            aria-label={`${t("common.remove")} ${item.label}: ${item.value}`}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {/* Danger red, but still 12px and unbolded: it is the one control here
          that throws work away, so it reads in the colour of removal while
          staying smaller than the chips it clears. */}
      {onClearAll && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onClearAll}
          className="h-auto px-1 py-0 text-xs font-normal text-destructive-ink hover:text-destructive-ink/80"
        >
          {t("common.clear_all")}
        </Button>
      )}
    </div>
  );
}
