import { useCallback, useMemo, useState } from "react";

import { useAppConfig } from "@/app/useAppConfig";
import { DEFAULT_PAGE_SIZE } from "@/utils/constants";

/**
 * How a list offers the rows it is not showing yet. Chosen once, in Settings →
 * General → Pagination (app.pagination_template), and obeyed by every list
 * table in the console.
 */
export type PaginationTemplate =
  | "numbered"
  | "prev_next"
  | "load_more"
  | "infinite";

const TEMPLATES: PaginationTemplate[] = [
  "numbered",
  "prev_next",
  "load_more",
  "infinite",
];

/**
 * The ceiling on rows in one view.
 *
 * Every admin list endpoint clamps page_size to 100 server-side, and the two
 * growing templates ask for a BIGGER page rather than stitching pages together
 * on the client: one query then always describes exactly what is on screen, so
 * a delete or a refetch redraws the same rows instead of collapsing the view
 * back to the first ten. The cost is this ceiling, which the pager states
 * plainly rather than leaving a button that quietly does nothing.
 */
export const MAX_ROWS = 100;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface Paging {
  /** Page to ask the API for. Always 1 for the growing templates. */
  page: number;
  /** Rows to ask for. Grows by one batch per "load more" in those templates. */
  pageSize: number;
  template: PaginationTemplate;
  /**
   * The same shape the lists already used with their own useState, so a filter
   * change still says setPage(1) — which here also drops back to one batch.
   * Stable for the life of the list: several lists reset the page from an
   * effect, and an identity that changed with the page would loop.
   */
  setPage: (next: number) => void;
  loadMore: () => void;
}

/**
 * The paging state of one list, configured by the two app.* settings.
 *
 * It replaces each list's own `useState(1)` + `DEFAULT_PAGE_SIZE`, so a change
 * in Settings reaches every table without any of them knowing which template is
 * in force.
 */
export function usePaging(): Paging {
  const { data: config } = useAppConfig();
  const [page, setPageState] = useState(1);
  const [batches, setBatches] = useState(1);

  const setPage = useCallback((next: number) => {
    setPageState(next);
    // A filter changed, or somebody went back to the top: either way the grown
    // window starts over.
    if (next === 1) setBatches(1);
  }, []);
  const loadMore = useCallback(() => setBatches((n) => n + 1), []);

  const base = clamp(config?.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_ROWS);
  const template = TEMPLATES.includes(
    config?.paginationTemplate as PaginationTemplate,
  )
    ? (config?.paginationTemplate as PaginationTemplate)
    : "numbered";
  const grows = template === "load_more" || template === "infinite";

  return useMemo(
    () => ({
      page: grows ? 1 : page,
      pageSize: grows ? Math.min(base * batches, MAX_ROWS) : base,
      template,
      setPage,
      loadMore,
    }),
    [grows, page, base, batches, template, setPage, loadMore],
  );
}
