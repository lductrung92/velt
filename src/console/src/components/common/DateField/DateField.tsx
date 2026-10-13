import { CalendarDays, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Dates travel through the forms as the strings the API stores — "2026-10-13",
// or "2026-10-13T09:30" when a time comes with them — so these two helpers are
// the only place that converts, and they read and write LOCAL components.
// Going through `new Date("2026-10-13")` would parse as UTC midnight and render
// as the 12th anywhere west of Greenwich; nobody picking a date expects the
// calendar to hand back the day before.
function parse(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function format(date: Date, withTime: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return withTime
    ? `${day}T${p(date.getHours())}:${p(date.getMinutes())}`
    : day;
}

/**
 * A date (optionally date + time) picker on react-day-picker, for the places
 * that used `<input type="date">`. Value in, value out, in the API's own string
 * format — a drop-in for the native input inside react-hook-form's FormControl.
 */
export const DateField = React.forwardRef<
  HTMLButtonElement,
  {
    value: string;
    onChange: (value: string) => void;
    /** Render the time row too, and emit "YYYY-MM-DDTHH:mm". */
    withTime?: boolean;
    disabled?: boolean;
    className?: string;
  } & Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onChange" | "type"
  >
>(function DateField(
  { value, onChange, withTime = false, disabled, className, ...rest },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const selected = parse(value);

  const label = selected
    ? new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" } : {}),
      }).format(selected)
    : t("common.date.pick");

  // Picking a day keeps whatever time is already in the value: someone who set
  // 09:30 and then moved the date by a day means to move the appointment, not
  // to reset it to midnight.
  const pick = (next?: Date) => {
    if (!next) return;
    const out = new Date(next);
    if (withTime && selected) {
      out.setHours(selected.getHours(), selected.getMinutes());
    }
    onChange(format(out, withTime));
    if (!withTime) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
              // The clear button sits on top of the right edge, so the
              // label has to stop before it rather than run underneath.
              value && !disabled ? "pr-9" : "",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              value ? "text-foreground" : "text-muted-foreground",
            )}
            {...rest}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        {value && !disabled && (
          // Outside the trigger: a button inside a button is not valid markup,
          // and Radix would open the popover on the way through.
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("common.date.clear")}
            className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          autoFocus
          selected={selected}
          defaultMonth={selected}
          onSelect={pick}
        />
        {withTime && (
          <div className="flex items-center gap-2 border-t p-3">
            <label
              htmlFor={`${rest.id ?? "date"}-time`}
              className="text-sm text-muted-foreground"
            >
              {t("common.date.time")}
            </label>
            <input
              id={`${rest.id ?? "date"}-time`}
              type="time"
              value={selected ? format(selected, true).slice(11) : ""}
              onChange={(e) => {
                const [h, mi] = e.target.value.split(":");
                if (h === undefined || mi === undefined) return;
                const base = selected ?? new Date();
                const out = new Date(base);
                out.setHours(+h, +mi, 0, 0);
                onChange(format(out, true));
              }}
              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
