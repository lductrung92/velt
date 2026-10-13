import { CalendarDays, X } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parse(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const date = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function format(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** 2 months side by side where there is room for them, 1 on a phone. */
function useMonthCount(): 1 | 2 {
  const query = "(min-width: 640px)";
  const [wide, setWide] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setWide(mq.matches);
    mq.addEventListener("change", sync);
    sync();
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide ? 2 : 1;
}

/**
 * One control for a "from → to" filter. Two separate date boxes with crossed
 * min/max guards describe a range without ever drawing one; here the calendar
 * paints the span itself, which is the question the filter is actually asking.
 *
 * `from` and `to` stay two values on the way out so the caller's query string,
 * filter chips and clearing behaviour are unchanged.
 */
export function DateRangeField({
  from,
  to,
  onChange,
  className,
  "aria-label": ariaLabel,
  ...rest
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "type"
>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const months = useMonthCount();
  const selected: DateRange | undefined = React.useMemo(() => {
    const start = parse(from);
    const end = parse(to);
    return start || end ? { from: start, to: end } : undefined;
  }, [from, to]);

  const fmt = React.useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }),
    [i18n.language],
  );
  const label = selected?.from
    ? selected.to
      ? `${fmt.format(selected.from)} – ${fmt.format(selected.to)}`
      : fmt.format(selected.from)
    : t("common.date.pick_range");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            // The visible text IS the value, so an aria-label on its own would
            // hide the selected range from a screen reader. Name the purpose
            // and the value together.
            aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
              // The clear button sits on top of the right edge, so the
              // label has to stop before it rather than run underneath.
              from || to ? "pr-9" : "",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              from || to ? "text-foreground" : "text-muted-foreground",
            )}
            {...rest}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        {(from || to) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            aria-label={t("common.date.clear")}
            className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {/*
        collisionPadding keeps the popover off the screen edges, and the height
        cap plus scroll is what saves it when it still cannot fit: below `sm`
        the two months stack, which made this 630px tall in an 844px viewport.
        Radix flipped it above the trigger and 224px of it — the month arrows
        and the first three weeks — ended up off the top of the screen with no
        way to scroll to them.
      */}
      <PopoverContent
        className="max-h-[calc(100dvh-5rem)] w-auto overflow-y-auto p-0"
        align="start"
        collisionPadding={16}
      >
        <Calendar
          mode="range"
          autoFocus
          // One month on a phone. Two stacked months is taller than the screen,
          // and a range that spans a month boundary is not what a phone is for.
          numberOfMonths={months}
          selected={selected}
          defaultMonth={selected?.from}
          // Deliberately no auto-close. The library completes the range on
          // EVERY click — the first gives a one-day range, the next widens it —
          // so "the range is complete" cannot tell a first click from a last
          // one, and closing on it would shut the calendar before the user
          // reached the second date. Escape and a click outside still close it.
          onSelect={(range) => {
            onChange(
              range?.from ? format(range.from) : "",
              range?.to ? format(range.to) : "",
            );
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
