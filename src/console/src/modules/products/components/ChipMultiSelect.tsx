import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// Toggleable chips for a small CLOSED vocabulary (audience, platforms). A
// dropdown would hide a four-item list behind a click; chips show the whole
// vocabulary and the current answer at once.
//
// For open-ended lists the author types (tech stack, highlights) use
// StringListField instead.
export function ChipMultiSelect({
  options,
  value,
  onChange,
  disabled,
  name,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Prefix for each chip's id, so a <label> can point at it in tests. */
  name: string;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            id={`${name}-${o.value}`}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
