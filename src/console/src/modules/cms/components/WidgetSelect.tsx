import Select from "react-select";

import { cn } from "@/lib/utils";

export interface WidgetSelectOption {
  value: string;
  label: string;
}

// react-select themed to match the shadcn input/popover look. Used for the enum
// fields in the inline-widget config forms. The menu is portalled to <body> so it
// is not clipped inside the editor's widget card / scroll container.
export function WidgetSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  inputId,
}: {
  value: string;
  options: WidgetSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  inputId?: string;
}) {
  return (
    <Select<WidgetSelectOption>
      inputId={inputId}
      aria-label={ariaLabel}
      isDisabled={disabled}
      isSearchable={false}
      unstyled
      classNamePrefix="rs"
      options={options}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(opt) => onChange(opt?.value ?? "")}
      menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
      classNames={{
        control: ({ isFocused }) =>
          cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
            isFocused && "ring-2 ring-ring ring-offset-1",
            disabled && "cursor-not-allowed opacity-50",
          ),
        valueContainer: () => "gap-1 px-1",
        singleValue: () => "text-foreground",
        placeholder: () => "text-muted-foreground",
        indicatorSeparator: () => "hidden",
        dropdownIndicator: () => "px-1 text-muted-foreground",
        menu: () =>
          "mt-1 overflow-hidden rounded-md border bg-popover text-sm text-popover-foreground shadow-md",
        option: ({ isFocused, isSelected }) =>
          cn(
            "cursor-pointer px-3 py-1.5",
            isFocused && "bg-accent text-accent-foreground",
            isSelected && "font-medium",
          ),
      }}
      styles={{
        // react-select keeps a default control min-height (38px) even when
        // unstyled; pin it to 36px (h-9) so the control lines up exactly with the
        // Input / Button height in shared form rows.
        control: (base) => ({ ...base, minHeight: "2.25rem", height: "2.25rem" }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      }}
    />
  );
}
