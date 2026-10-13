import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { vi, enUS } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// react-day-picker wearing this app's tokens. The library owns the hard parts —
// keyboard grid navigation, ARIA roles, range selection, month arithmetic — and
// everything below is presentation.
//
// The week starts on Monday because that is how a Vietnamese calendar reads;
// react-day-picker takes that from the locale, and `vi` already says so.
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  const { i18n } = useTranslation();
  const day = cn(
    buttonVariants({ variant: "ghost" }),
    "size-9 p-0 font-normal aria-selected:opacity-100",
  );
  return (
    <DayPicker
      locale={i18n.language.startsWith("vi") ? vi : enUS}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-sm font-medium capitalize",
        nav: "flex items-center gap-1 absolute inset-x-3 top-3 justify-between pointer-events-none",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 p-0 pointer-events-auto disabled:opacity-40",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 p-0 pointer-events-auto disabled:opacity-40",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-caption font-normal uppercase text-muted-foreground",
        week: "flex w-full mt-1.5",
        // Every modifier class lands on the same <td>, next to `day` — the
        // button inside it only ever gets `day_button`. So the cell carries the
        // range tint (which has to run edge to edge, with only the two ends
        // rounded) and reaches the button with [&>button] for the rest.
        day: "relative p-0 text-center text-sm",
        day_button: day,
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        range_start: "rounded-l-md bg-accent",
        range_end: "rounded-r-md bg-accent",
        // `selected` is set on the middle days too and is written to the same
        // element, so neither class can win on source order alone. This is the
        // one place that needs to override rather than compose.
        range_middle:
          "bg-accent [&>button]:!bg-transparent [&>button]:!text-accent-foreground",
        today: "[&>button]:font-medium [&>button]:text-primary",
        outside: "[&>button]:text-muted-foreground/40",
        disabled: "[&>button]:text-muted-foreground/30 [&>button]:line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  );
}
