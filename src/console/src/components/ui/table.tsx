import { Inbox } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

// shadcn Table primitive. Listing-table convention:
//   - header text never wraps (TableHead has `whitespace-nowrap`)
//   - first column stays pinned during horizontal scroll
//   - thead stays pinned during vertical scroll (only when scroll-capped)
//   - Ctrl/Cmd + drag pans horizontally
//
// `scroll` (default true): cap the height to the viewport with an inner vertical
// scroll + a sticky header. PAGINATED lists pass `scroll={false}` — the page
// already caps rows, so the table renders inline (no inner vertical scrollbar,
// no sticky head); horizontal scroll for wide tables is kept either way.
// Opt-outs via className/wrapperClassName (e.g. `max-h-none`).
interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
  scroll?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, wrapperClassName, scroll = true, ...props }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Ctrl/Cmd + left-drag horizontal pan. Explicit modifier so normal
    // clicks / text selection are never hijacked.
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      let panning = false;
      let startX = 0;
      let startScrollLeft = 0;
      let prevUserSelect = "";

      function onMouseDown(e: MouseEvent) {
        if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        panning = true;
        startX = e.clientX;
        startScrollLeft = el!.scrollLeft;
        prevUserSelect = el!.style.userSelect;
        el!.style.userSelect = "none";
        el!.dataset.panning = "1";
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp, true);
      }
      function onMouseMove(e: MouseEvent) {
        if (!panning) return;
        el!.scrollLeft = startScrollLeft - (e.clientX - startX);
      }
      function onMouseUp() {
        if (!panning) return;
        panning = false;
        el!.style.userSelect = prevUserSelect;
        delete el!.dataset.panning;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp, true);
      }
      function onKey(e: KeyboardEvent) {
        el!.dataset.panArmed = e.ctrlKey || e.metaKey ? "1" : "";
      }

      el.addEventListener("mousedown", onMouseDown);
      document.addEventListener("keydown", onKey);
      document.addEventListener("keyup", onKey);
      return () => {
        el.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("keyup", onKey);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp, true);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className={cn(
          // bg-background on the surface so the sticky first column (also
          // bg-background) blends with the other cells instead of looking like
          // a lighter strip over a muted page.
          "relative w-full border-b bg-background",
          // Paginated lists (scroll=false): no height cap → render inline, page
          // flows. Tree/unpaginated (scroll=true): cap height + inner scroll.
          scroll
            ? "max-h-[calc(100vh-14rem)] overflow-auto"
            : "overflow-x-auto",
          "data-[pan-armed='1']:cursor-grab data-[panning='1']:!cursor-grabbing",
          wrapperClassName ?? "border rounded-md",
        )}
      >
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom text-sm",
            // Sticky first column (X axis)
            "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-10",
            // Surface tints live on the CELLS (not the row) so the sticky first
            // column matches the rest of its row exactly — no alpha double-stack.
            // Header + row-hover share the content tint (#fafcfd = bg-muted/30);
            // body cells are otherwise the plain content surface.
            "[&_thead_tr>*]:bg-muted/30",
            "[&_tbody_tr>*]:bg-background [&_tbody_tr>*]:transition-colors",
            "[&_tbody_tr:hover>*]:bg-muted/30",
            "[&_tbody_tr[data-state=selected]>*]:bg-muted",
            // Sticky thead (Y axis) only when the table owns the vertical scroll;
            // z-20 keeps the corner cell on top. Paginated lists skip it.
            // An OPAQUE bg-background on the <thead> sits behind the translucent
            // bg-muted/30 cells so rows scrolling under it don't bleed through
            // (the composited colour is unchanged); a bottom border on the cells
            // keeps a crisp separator that survives border-collapse while sticky.
            scroll &&
              "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-background [&_thead_tr>*]:border-b",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // Row tints (hover / selected) live on the cells (table-level selectors)
      // so the sticky first column matches the row in every state.
      "border-b transition-colors",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground [&_button]:uppercase",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-3 align-middle", className)} {...props} />
));
TableCell.displayName = "TableCell";

// TableEmpty — the ONE standard empty row for list tables (docs/styles/console/
// table.md §2): the table header stays visible and this row renders the shared
// icon + "no data" message centered (same message for initial-empty and
// filter-empty). `colSpan` = the table's column count. `!bg-background` opts the
// row out of the hover tint (an empty message must not react to hover).
function TableEmpty({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="!bg-background">
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-6" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {t("common.empty_state.default_title")}
          </p>
        </div>
      </TableCell>
    </TableRow>
  );
}

export {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
};
