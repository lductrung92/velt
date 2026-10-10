import { Check, Filter, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// List-screen filter as an anchored dropdown (not a modal). Clicking outside
// does NOT close it — close via ✕, Apply, or Esc. Draft → apply model: the
// parent holds draft state and commits on Apply.
export function FilterPopover({
  open,
  onOpenChange,
  children,
  onApply,
  onReset,
  filterActive,
  title,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  onApply: () => void;
  onReset: () => void;
  filterActive?: boolean;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={t("common.filter")}
          aria-label={t("common.filter")}
          className="relative"
        >
          <Filter className="size-4" aria-hidden />
          {filterActive && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
              aria-hidden
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        onInteractOutside={(e) => e.preventDefault()}
        className={cn("w-80 p-0", className)}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">
            {title ?? t("common.filter")}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={t("common.close")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply();
          }}
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
            {children}
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="size-4" />
              {t("common.reset")}
            </Button>
            <Button type="submit" size="sm">
              <Check className="size-4" />
              {t("common.apply")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
