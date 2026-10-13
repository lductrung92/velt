import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";

// nextSort cycles a column through asc → desc → cleared, matching the API sort
// convention ("col" asc, "-col" desc, null none). Shared so every list table
// cycles identically.
function nextSort(cur: string | null, col: string): string | null {
  return cur === col ? `-${col}` : cur === `-${col}` ? null : col;
}

// SortableHead is the tri-state sortable column header used by every list table
// (single source for the markup + aria-sort so the three list pages can't drift).
export function SortableHead({
  col,
  label,
  sort,
  onSort,
  className,
}: {
  col: string;
  label: string;
  sort: string | null;
  onSort: (next: string | null) => void;
  /** Extra classes on the <TableHead> (e.g. `text-right` for numeric columns). */
  className?: string;
}) {
  const Icon =
    sort === col ? ArrowUp : sort === `-${col}` ? ArrowDown : ArrowUpDown;
  const ariaSort =
    sort === col ? "ascending" : sort === `-${col}` ? "descending" : "none";
  const active = sort === col || sort === `-${col}`;
  return (
    <TableHead aria-sort={ariaSort} className={className}>
      <button
        type="button"
        // The ring is spelled out here rather than left to `.list-page button`:
        // the sortable head is used on screens outside that container too, and
        // there it fell back to the browser's own hairline outline.
        className="inline-flex items-center gap-1 rounded-sm ring-offset-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onSort(nextSort(sort, col))}
      >
        {label}
        <Icon
          className={
            active
              ? "size-3.5 text-foreground"
              : "size-3.5 text-muted-foreground/50"
          }
        />
      </button>
    </TableHead>
  );
}
