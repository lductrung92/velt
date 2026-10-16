import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import { MAX_ROWS, type Paging } from "@/hooks/usePaging";

/**
 * The footer of a list table: whichever pager the configured template calls
 * for. `total` is the API's row count, `loading` its in-flight state (so the
 * growing templates can say they are working and not ask twice).
 */
export function ListPager({
  paging,
  total,
  loading = false,
  className,
}: {
  paging: Paging;
  total: number;
  loading?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { page, pageSize, template, setPage, loadMore } = paging;
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loaded = Math.min(pageSize, total);
  const grows = template === "load_more" || template === "infinite";
  const more = grows && loaded < total && pageSize < MAX_ROWS;

  // Infinite: the sentinel sits under the last row, so reaching it asks for the
  // next batch. Re-armed on every render that changes what it would do, and
  // never while a request is already out.
  useEffect(() => {
    if (template !== "infinite" || !more || loading) return;
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [template, more, loading, loadMore]);

  if (!grows) {
    return (
      <TablePagination
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        compact={template === "prev_next"}
        className={className}
      />
    );
  }

  // Nothing to offer: everything the list has fits in the window already.
  if (loaded >= total) return null;

  return (
    <div
      className={className}
      data-testid="list-pager"
      data-template={template}
    >
      <div className="flex flex-col items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
        {/* The count is the whole feedback these templates give: there is no
            page number left to say where you are. */}
        <span>{t("common.pagination.loaded", { loaded, total })}</span>
        {more && template === "load_more" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={loadMore}
          >
            {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}
            {t("common.pagination.load_more")}
          </Button>
        )}
        {more && template === "infinite" && (
          <div ref={sentinel} className="flex h-6 items-center">
            {loading && (
              <Loader2
                className="size-4 animate-spin"
                aria-label={t("common.loading")}
              />
            )}
          </div>
        )}
        {!more && (
          // The ceiling, said out loud: there are more rows, and this view
          // cannot reach them.
          <span>{t("common.pagination.ceiling", { max: MAX_ROWS })}</span>
        )}
      </div>
    </div>
  );
}
