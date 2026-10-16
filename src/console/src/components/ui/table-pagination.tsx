import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Re-exported for back-compat; the source of truth is @/utils/constants.
export { DEFAULT_PAGE_SIZE } from "@/utils/constants";

interface Props {
  /** 1-based current page. */
  page: number;
  /** Total rows across all pages (BE response.total). */
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  /** Page buttons each side of current (default 1). */
  siblingCount?: number;
  /** Page buttons anchored at each edge (default 1). */
  boundaryCount?: number;
  /** Hide the "from–to / total" info text. */
  hideInfo?: boolean;
  /** Only prev/next, no numbered buttons. */
  compact?: boolean;
  className?: string;
}

type PageItem = number | "ellipsis";

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// MUI/Mantine-style range: always show the first/last `boundaries`, show
// `siblings` around current, collapse gaps > 1 into an ellipsis marker.
function getPaginationRange({
  current,
  total,
  siblings,
  boundaries,
}: {
  current: number;
  total: number;
  siblings: number;
  boundaries: number;
}): PageItem[] {
  const totalSlots = boundaries * 2 + siblings * 2 + 3;
  if (totalSlots >= total) return range(1, total);

  const leftSibling = Math.max(current - siblings, boundaries + 1);
  const rightSibling = Math.min(current + siblings, total - boundaries);
  const showLeftEllipsis = leftSibling > boundaries + 2;
  const showRightEllipsis = rightSibling < total - boundaries - 1;
  const firstPages = range(1, boundaries);
  const lastPages = range(total - boundaries + 1, total);

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = boundaries + siblings * 2 + 2;
    return [...range(1, leftItemCount), "ellipsis", ...lastPages];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = boundaries + siblings * 2 + 2;
    return [
      ...firstPages,
      "ellipsis",
      ...range(total - rightItemCount + 1, total),
    ];
  }
  return [
    ...firstPages,
    "ellipsis",
    ...range(leftSibling, rightSibling),
    "ellipsis",
    ...lastPages,
  ];
}

// Listing pagination footer. Auto-hides when the result fits one page.
export function TablePagination({
  page,
  total,
  pageSize,
  onPageChange,
  siblingCount = 1,
  boundaryCount = 1,
  hideInfo = false,
  compact = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const items = compact
    ? []
    : getPaginationRange({
        current: page,
        total: totalPages,
        siblings: siblingCount,
        boundaries: boundaryCount,
      });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      {hideInfo ? (
        <span />
      ) : (
        <span>{t("common.pagination.page_info", { from, to, total })}</span>
      )}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={compact ? "default" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t("common.pagination.prev")}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {items.map((item, idx) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="select-none px-1 text-xs text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "default" : "ghost"}
              size="sm"
              className="h-8 min-w-8 px-2 text-xs"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant={compact ? "default" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t("common.pagination.next")}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
