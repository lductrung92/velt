import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import * as React from "react";
import type { DayPickerProps, DropdownProps } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Select } from "@/components/common/Select";
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

// react-day-picker hands this the props of the <select> it would have rendered
// itself, so the console's own Select has to post the choice back as the change
// event the library's handler expects — it only ever reads `target.value`.
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  label,
  width,
}: DropdownProps & { label: string; width: string }) {
  const current = options?.find((option) => option.value === value);
  return (
    <div className={width}>
      <Select
        aria-label={label}
        isClearable={false}
        isSearchable={false}
        isDisabled={disabled}
        // h-7 is the height the caption label already had. The range popover
        // is 630px tall on a phone before anything is added to it (bug-125),
        // so the header is the one row that must not grow.
        className="h-7 px-2 pr-7"
        value={
          current
            ? { value: String(current.value), label: current.label }
            : null
        }
        options={(options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onChange={(option) =>
          option &&
          onChange?.({
            target: { value: option.value },
          } as React.ChangeEvent<HTMLSelectElement>)
        }
      />
    </div>
  );
}

function MonthsDropdown(props: DropdownProps) {
  const { t } = useTranslation();
  // Wide enough for "December"; the Vietnamese names are "Tháng 12".
  return (
    <CalendarDropdown
      {...props}
      label={t("common.date.month")}
      width="w-[6.25rem]"
    />
  );
}

function YearsDropdown(props: DropdownProps) {
  const { t } = useTranslation();
  return (
    <CalendarDropdown
      {...props}
      label={t("common.date.year")}
      width="w-[4.75rem]"
    />
  );
}

const dropdownComponents: DayPickerProps["components"] = {
  // Handing DayPicker a `components` map replaces Calendar's own outright, so
  // the arrow chevron has to come along or it falls back to the library's
  // unstyled 24px svg inside a 28px button.
  Chevron: ({ orientation, ...rest }) =>
    orientation === "left" ? (
      <ChevronLeft className="size-4" {...rest} />
    ) : (
      <ChevronRight className="size-4" {...rest} />
    ),
  MonthsDropdown,
  YearsDropdown,
};

/**
 * Month and year dropdowns for the calendar header, as props to spread onto
 * `<Calendar>`. Stepping to March 2024 with the ‹ arrow alone is a dozen
 * clicks; the arrows still work, and they and the dropdowns move the same
 * month. Shared with DateRangeField, where each of the two visible months
 * carries its own pair and changing either slides the whole window.
 *
 * Pass the dates the field already holds: the year list has to be bounded for
 * the library to offer one at all, and a stored date from outside the window
 * would otherwise be both unreachable and un-displayable.
 */
export function useMonthDropdowns(...held: (Date | undefined)[]) {
  const { i18n } = useTranslation();
  const month = React.useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "long" }),
    [i18n.language],
  );
  const now = new Date().getFullYear();
  const years = held.filter((d): d is Date => !!d).map((d) => d.getFullYear());
  return {
    captionLayout: "dropdown",
    startMonth: new Date(Math.min(now - 5, ...years), 0),
    endMonth: new Date(Math.max(now + 5, ...years), 11),
    classNames: { dropdowns: "flex items-center gap-1" },
    // The library's own label is date-fns' "LLLL" — "Tháng Mười Hai", too long
    // to sit between the arrows. Intl's month name is "Tháng 12".
    formatters: { formatMonthDropdown: (date: Date) => month.format(date) },
    components: dropdownComponents,
  } as const;
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
  const dropdowns = useMonthDropdowns(selected);

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
              "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm",
              // The clear button sits on top of the right edge, so the
              // label has to stop before it rather than run underneath.
              value && !disabled ? "pr-9" : "",
              "focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/25",
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
          {...dropdowns}
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
              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
